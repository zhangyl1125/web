#!/usr/bin/env python3
"""Build through the current user's authenticated local HTTP proxy.

Downloads missing official base images with digest verification, then runs Compose
with an ephemeral Docker-bridge relay. The relay stops when the build finishes.
Requires Python 3.8+, Docker access and a working local HTTP proxy on port 3128.
"""
import concurrent.futures
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import urllib.parse

ACCEPT = ', '.join([
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
])


class RegistryRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and urllib.parse.urlsplit(req.full_url).netloc != urllib.parse.urlsplit(newurl).netloc:
            redirected.remove_header('Authorization')
        return redirected


def fetch(url, headers=None):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=120)


def pull(name, architecture):
    repo, tag = name.split(':')
    repo = 'library/' + repo
    with fetch('https://auth.docker.io/token?service=registry.docker.io&scope=repository:' + repo + ':pull') as response:
        token = json.load(response)['token']
    headers = {'Authorization': 'Bearer ' + token, 'Accept': ACCEPT}
    base = 'https://registry-1.docker.io/v2/' + repo
    with fetch(base + '/manifests/' + tag, headers) as response:
        index = json.load(response)
    descriptor = next(m for m in index['manifests'] if m.get('platform', {}).get('os') == 'linux' and m['platform'].get('architecture') == architecture)
    with fetch(base + '/manifests/' + descriptor['digest'], headers) as response:
        raw_manifest = response.read()
    assert 'sha256:' + hashlib.sha256(raw_manifest).hexdigest() == descriptor['digest']
    manifest = json.loads(raw_manifest)
    with tempfile.TemporaryDirectory(prefix='hackhub-image-') as directory:
        directory = Path(directory)

        def blob(descriptor):
            digest = descriptor['digest']
            dest = directory / digest.split(':')[1]
            for attempt in range(3):
                try:
                    hasher = hashlib.sha256()
                    with fetch(base + '/blobs/' + digest, headers) as response, dest.open('wb') as output:
                        while chunk := response.read(1024 * 1024):
                            hasher.update(chunk)
                            output.write(chunk)
                    assert 'sha256:' + hasher.hexdigest() == digest, 'Blob digest mismatch'
                    assert dest.stat().st_size == descriptor['size'], 'Blob size mismatch'
                    return dest
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2)

        config = blob(manifest['config'])
        diff_ids = json.loads(config.read_text())['rootfs']['diff_ids']
        print(name + ': downloading ' + str(len(manifest['layers'])) + ' verified layers', flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            compressed = list(executor.map(blob, manifest['layers']))
        layer_names = []
        for i, source in enumerate(compressed):
            dest = directory / (str(i) + '.tar')
            hasher = hashlib.sha256()
            opener = gzip.open if 'gzip' in manifest['layers'][i]['mediaType'] else open
            with opener(source, 'rb') as stream, dest.open('wb') as output:
                while chunk := stream.read(1024 * 1024):
                    hasher.update(chunk)
                    output.write(chunk)
            assert 'sha256:' + hasher.hexdigest() == diff_ids[i], 'Uncompressed layer digest mismatch'
            source.unlink()
            layer_names.append(dest.name)
        config_name = config.name + '.json'
        config.rename(directory / config_name)
        (directory / 'manifest.json').write_text(json.dumps([{'Config': config_name, 'RepoTags': [name], 'Layers': layer_names}]))
        archive = directory / 'image.tar'
        with tarfile.open(archive, 'w') as output:
            for filename in ['manifest.json', config_name] + layer_names:
                output.add(directory / filename, arcname=filename)
        subprocess.run(['docker', 'load', '-i', str(archive)], check=True)
        print(name + ': imported ' + descriptor['digest'], flush=True)



import select
import socket
import socketserver
import threading


class Relay(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            with socket.create_connection(('127.0.0.1', 3128), timeout=30) as upstream:
                upstream.settimeout(None)
                peers = {self.request: upstream, upstream: self.request}
                while ready := select.select(list(peers), [], [], 120)[0]:
                    for source in ready:
                        data = source.recv(65536)
                        if not data:
                            return
                        peers[source].sendall(data)
        except OSError:
            pass


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    import os
    root = Path(__file__).resolve().parents[1]
    architecture = subprocess.check_output(['docker', 'info', '--format', '{{.Architecture}}'], text=True).strip()
    architecture = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(architecture, architecture)
    # Explicitly use the logged-in user's local enterprise proxy for downloads.
    urllib.request.install_opener(urllib.request.build_opener(RegistryRedirect(), urllib.request.ProxyHandler({
        'http': 'http://127.0.0.1:3128', 'https': 'http://127.0.0.1:3128',
    })))
    # Derive base images from the actual Dockerfiles, so version changes are honored.
    images = []
    for filename in ['hackhub-app/Dockerfile', 'hackhub-api/Dockerfile']:
        stages = set()
        for line in (root / filename).read_text().splitlines():
            fields = line.split()
            if fields and fields[0].upper() == 'FROM':
                name = fields[1]
                if name not in stages and name not in images:
                    images.append(name)
                if len(fields) == 4 and fields[2].upper() == 'AS':
                    stages.add(fields[3])
    for name in images:
        if subprocess.run(['docker', 'image', 'inspect', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            print('Fetching missing base image: ' + name, flush=True)
            pull(name, architecture)
    gateway = subprocess.check_output(['docker', 'network', 'inspect', 'bridge', '--format', '{{(index .IPAM.Config 0).Gateway}}'], text=True).strip()
    with Server((gateway, 0), Relay) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        proxy = 'http://host.docker.internal:' + str(server.server_address[1])
        env = dict(os.environ, DOCKER_BUILD_HTTP_PROXY=proxy, DOCKER_BUILD_HTTPS_PROXY=proxy)
        try:
            print('Building via temporary user proxy relay', flush=True)
            result = subprocess.run(['docker', 'compose', '--progress', 'plain', 'build', 'app', 'api'], cwd=root, env=env)
            return result.returncode
        finally:
            server.shutdown()
            thread.join()


if __name__ == '__main__':
    raise SystemExit(main())
