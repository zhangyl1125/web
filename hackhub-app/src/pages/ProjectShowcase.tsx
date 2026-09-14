import {
  Container,
  Stack,
  Title,
  Text,
  Card,
  Group,
  Badge,
  Button,
  Grid,
  ActionIcon,
  Avatar,
  ThemeIcon,
  Select,
  TextInput,
  SimpleGrid,
  Modal,
  CloseButton,
  Center,
  Alert,
  Image,
  FileInput,
  Textarea,
  UnstyledButton,
  Checkbox,
} from '@mantine/core'
import {
  IconTrophy,
  IconThumbUp,
  IconThumbUpFilled,
  IconBrandGithub,
  IconWorldWww,
  IconSearch,
  IconUser,
  IconExternalLink,
  IconUpload,
  IconGavel,
  IconArrowRight,
  IconInfoCircle,
  IconPhoto,
  IconCheck,
  IconTrash,
} from '@tabler/icons-react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLanguage } from '../contexts/LanguageContext'
import { notifications } from '@mantine/notifications'
import { getAllPages } from '../services/pagination'
import { api, ApiError } from '../lib/apiClient'
import { HackathonService } from '../services/hackathonService'
import { PublicAwardService, type AwardSummary } from '../services/publicAwardService'
import { IdeaService } from '../services/ideaService'
import { OrganizationService } from '../services/organizationService'
import { ProfileService } from '../services/profileService'
import { StorageService, MAX_UPLOAD_BYTES, PHOTO_ACCEPT, validatePersonalPhoto } from '../services/storageService'
import { TeamService } from '../services/teamService'
import { JudgingService } from '../services/judgingService'
import {
  DIGITAL_PIONEER_TRACKS,
  DIGITAL_PIONEER_VOTING_RULES,
  normalizeDigitalPioneerTrack,
} from '../config/digitalPioneer'
import { AwardCriteriaList } from '../components/AwardCriteriaList'
import './DigitalPioneer.css'

interface Project {
  id: string
  title: string
  description: string
  nominee_name: string
  nominee_org_code: string
  team_members: Array<{
    id: string
    name: string
    avatar?: string
    role?: string
  }>
  hackathon_id: string
  category: string
  technologies: string[]
  github_url?: string
  demo_url?: string
  video_url?: string
  images: string[]
  votes: number
  user_vote?: boolean
  status: 'draft' | 'submitted' | 'in-progress' | 'completed'
  created_at: string
  submission_date: string
}

interface ProjectFilters {
  search: string
  category: string
  department: string
}

interface ProjectUploadForm {
  hackathonId: string
  nomineeUserId: string
  executiveSummary: string
  achievementImpact: string
  cultureDemonstration: string
  category: string
  technologies: string
}

const emptyUploadForm = (): ProjectUploadForm => ({
  hackathonId: '',
  nomineeUserId: '',
  executiveSummary: '',
  achievementImpact: '',
  cultureDemonstration: '',
  category: '',
  technologies: '',
})

const parseNominationTags = (value: string): string[] =>
  [...new Set(value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean))]

const tagHint = 'Add up to 5 tags, separated by 、, ， or commas (,).'

const nominationHeadings = [
  'Executive Summary (The Elevator Pitch)',
  'Details of Your Core Achievement in 2026 and Business Impact (including financial figures)',
  'How you demonstrate BD China culture (especially on you applied category) ?',
]

function parseNominationDescription(description: string) {
  const sections: Array<{ heading: string; body: string }> = []
  let heading = ''
  let lines: string[] = []
  for (const line of description.split(/\r?\n/)) {
    const label = line.trim().replace(/^\*\*|\*\*$/g, '')
    const index = /^Executive Summary(?: \(The Elevator Pitch\))?$/i.test(label) ? 0
      : label === nominationHeadings[1] ? 1
      : /^How you demonstrate (?:Bosch|BD) China culture \(especially (?:in your|on you) applied category\)\s*\??$/i.test(label) ? 2
      : -1
    if (index >= 0) {
      if (heading || lines.join('\n').trim()) sections.push({ heading, body: lines.join('\n').trim() })
      heading = nominationHeadings[index]
      lines = []
    } else {
      lines.push(line)
    }
  }
  if (heading || lines.join('\n').trim()) sections.push({ heading, body: lines.join('\n').trim() })
  return sections
}

function nominationSummary(description: string) {
  const sections = parseNominationDescription(description)
  return sections.find((section) => section.heading === nominationHeadings[0])?.body
    ?? sections.find((section) => !section.heading)?.body ?? ''
}

function readVotingCart(userId: string | undefined): { userId: string | undefined; ids: string[] } {
  try {
    const stored: unknown = userId ? JSON.parse(localStorage.getItem(`award-voting-cart-v1:${userId}`) ?? '[]') : []
    return { userId, ids: Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [] }
  } catch {
    return { userId, ids: [] }
  }
}

export function ProjectShowcase({ nominationMode = false, managementMode = false }: { nominationMode?: boolean; managementMode?: boolean }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cart, setCart] = useState(() => readVotingCart(user?.id))
  const cartIds = useMemo(() => new Set(cart.userId === user?.id ? cart.ids : []), [cart, user?.id])
  const [submitting, setSubmitting] = useState(false)
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [recordToDelete, setRecordToDelete] = useState<Project | null>(null)
  const [deletingRecord, setDeletingRecord] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const ballotBusy = useRef(false)
  const recordsOpened = searchParams.get('view') === 'voting-records'
  const closeVotingRecords = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      return next
    }, { replace: true })
  }
  const nomineeToOpen = searchParams.get('nominee')
  const canNominate = user?.role === 'admin' || user?.role === 'manager'
  const canDelete = managementMode && user?.role === 'admin'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDeletion, setPendingDeletion] = useState<Project[]>([])
  const [deleting, setDeleting] = useState(false)
  const deletingRef = useRef(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null)

  const loadSequence = useRef(0)
  const restoredNominee = useRef<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [cartOpened, setCartOpened] = useState(false)
  const closeVoteCart = () => {
    setCartOpened(false)
    // On mobile the trigger must be visible again before it can receive focus.
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.dp-vote-cart-button')?.focus({ preventScroll: true })
    })
  }
  const [voteError, setVoteError] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [modalOpened, setModalOpened] = useState(false)
  const [nominees, setNominees] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [nomineeLoadError, setNomineeLoadError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hackathons, setHackathons] = useState<AwardSummary[]>([])
  const [projectImage, setProjectImage] = useState<File | null>(null)
  const [uploadForm, setUploadForm] = useState<ProjectUploadForm>(emptyUploadForm)
  const [assignedJudgeHackathons, setAssignedJudgeHackathons] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<ProjectFilters>({
    search: '',
    category: '',
    department: '',
  })

  const loadProjects = useCallback(async () => {
      const sequence = ++loadSequence.current
      setLoading(true)
      setLoadError(false)
      try {
        if (!user) {
          const awards = await getAllPages((page) => PublicAwardService.getAwards(page))
          if (sequence !== loadSequence.current) return
          setHackathons(awards)
          const nominations = await Promise.all(awards.map((award) => getAllPages((page) => PublicAwardService.getNominations(award.id, page))))
          if (sequence !== loadSequence.current) return
          setProjects(nominations.flat().map((nomination) => ({ ...nomination, technologies: parseNominationTags(nomination.technologies.join(',')), team_members: [], user_vote: false })))
          return
        }
        const loadedHackathons = await getAllPages((page) => HackathonService.getHackathons(page, 100))
        if (sequence !== loadSequence.current) return
        setHackathons(loadedHackathons)
        const currentAward = loadedHackathons.find((award) => award.status === 'running') ?? loadedHackathons[0]
        setUploadForm((current) => current.hackathonId || loadedHackathons.length === 0
          ? current
          : { ...current, hackathonId: currentAward.id })

        const hackathonData = await Promise.all(loadedHackathons.map(async (hackathon) => {
          const [ideasPage, teams] = await Promise.all([
            getAllPages((page) => IdeaService.getIdeas(hackathon.id, page, 100)),
            TeamService.getTeams(hackathon.id),
          ])

          const teamsWithMembers = await Promise.all(teams.map(async (team) => ({
            team,
            members: await TeamService.getTeamMembers(team.id).catch(() => []),
          })))
          const membersByTeam = new Map(teamsWithMembers.map(({ team, members }) => [team.id, members]))

          const projectList = await Promise.all(ideasPage.map(async (idea): Promise<Project> => {
            const team = teams.find((candidate) => candidate.id === idea.teamId)
            const members = team ? membersByTeam.get(team.id) ?? [] : []
            const teamMembers = await Promise.all(members.map(async (member) => {
              const profile = await ProfileService.getProfile(member.userId).catch(() => null)
              return {
                id: member.userId,
                name: profile?.name ?? member.userId,
                avatar: profile?.avatarUrl ?? undefined,
                role: member.role,
              }
            }))
            const screenshots = (idea.projectAttachments ?? [])
              .filter((attachment) => attachment.type === 'screenshot')
            const images = await Promise.all(screenshots.map(async (attachment) => {
              if (!attachment.storageKey) return attachment.url
              return StorageService.getPresignedUrl('project-attachments', attachment.storageKey)
                .catch(() => attachment.url)
            }))

            const creatorProfile = teamMembers.length > 0
              ? null
              : await ProfileService.getProfile(idea.createdBy).catch(() => null)

            return {
              id: idea.id,
              title: idea.title,
              description: idea.description,
              nominee_org_code: idea.projectAttachments?.find((attachment) => attachment.type === 'nomination')?.nomineeOrgCode ?? '',
              nominee_name: idea.projectAttachments?.find((attachment) => attachment.type === 'nomination')?.name ?? teamMembers[0]?.name ?? creatorProfile?.name ?? team?.name ?? 'Individual Nominee',
              team_members: teamMembers,
              hackathon_id: hackathon.id,
              category: normalizeDigitalPioneerTrack(idea.category, idea.tags ?? []),
              technologies: parseNominationTags((idea.tags ?? []).join(',')),
              github_url: idea.repositoryUrl ?? undefined,
              demo_url: idea.demoUrl ?? undefined,
              images: [...images, ...(idea.attachments ?? [])].filter(Boolean),
              votes: idea.votes ?? 0,
              user_vote: idea.userHasVoted ?? false,
              status: idea.status,
              created_at: idea.createdAt,
              submission_date: idea.updatedAt,
            }
          }))

          return { projectList }
        }))
        if (sequence !== loadSequence.current) return
        setProjects(hackathonData.flatMap(({ projectList }) => projectList))
      } catch (error) {
        if (sequence !== loadSequence.current) return
        setLoadError(true)
        console.error('Error loading projects:', error)
        notifications.show({
          title: 'Unable to load nominations',
          message: 'Refresh the page to try again.',
          color: 'red',
        })
      } finally {
        if (sequence === loadSequence.current) setLoading(false)
      }
  }, [user])

  useEffect(() => {
    setCart(readVotingCart(user?.id))
    setRecordToDelete(null)
    setSubmissionState('idle')
    setRecordError(null)
    setProjects([])
    setAssignedJudgeHackathons(new Set())
    setNominees([])
    setNomineeLoadError(false)
    setUploadForm(emptyUploadForm())
    setProjectImage(null)
    setSelectedProject(null)
    setModalOpened(false)
    setCartOpened(false)
    setVoteError(null)
    setSelectedIds(new Set())
    setPendingDeletion([])
    setDeleteError(null)
    setDeleteSuccess(null)
    void loadProjects()
    return () => { loadSequence.current += 1 }
  }, [loadProjects, user?.id])

  useEffect(() => {
    if (!cart.userId || cart.userId !== user?.id) return
    try {
      localStorage.setItem(`award-voting-cart-v1:${cart.userId}`, JSON.stringify(cart.ids))
    } catch {
      // The cart remains usable in memory when browser storage is unavailable.
    }
  }, [cart, user?.id])

  useEffect(() => {
    if (!nominationMode || !user || user.role === 'participant') return
    let cancelled = false
    const loadNominees = async () => {
      try {
        const candidates = user.role === 'admin'
          ? await getAllPages((page) => api.get<{ content: Array<{ id: string; name: string; email: string }>; totalPages?: number }>(`/api/v1/admin/users?page=${page}&size=200&sort=name,asc`))
          : (await Promise.all((await OrganizationService.getMyOrganizations()).map(async (org) =>
              (await OrganizationService.getMembers(org.id)).map((member) => ({
                id: member.userId, name: member.name ?? member.email ?? member.userId, email: member.email ?? '',
              }))
            ))).flat()
        if (!cancelled) setNominees([...new Map([{ id: user.id, name: user.name, email: user.email }, ...candidates].map((candidate) => [candidate.id, candidate])).values()])
      } catch {
        if (!cancelled) setNomineeLoadError(true)
      }
    }
    void loadNominees()
    return () => { cancelled = true }
  }, [nominationMode, user])

  const nominationTags = parseNominationTags(uploadForm.technologies)
  const tooManyTags = nominationTags.length > 5
  const photoError = validatePersonalPhoto(projectImage)

  const handleProjectUpload = async () => {
    if (!user || !canNominate || uploading) return
    if (!uploadForm.hackathonId || !uploadForm.executiveSummary.trim()
      || !uploadForm.achievementImpact.trim() || !uploadForm.cultureDemonstration.trim()
      || !uploadForm.category.trim() || !projectImage) {
      notifications.show({
        title: 'Missing Information',
        message: 'Complete all required fields and select a nominee photo.',
        color: 'orange',
      })
      return
    }

    if (photoError) {
      notifications.show({ title: 'Invalid photo', message: photoError, color: 'orange' })
      return
    }

    if (tooManyTags) {
      notifications.show({ title: 'Too many tags', message: tagHint, color: 'orange' })
      return
    }

    const nomineeUserId = uploadForm.nomineeUserId || user!.id
    const nomineeName = nominees.find((candidate) => candidate.id === nomineeUserId)?.name ?? user!.name
    setUploading(true)
    try {
      const technologies = nominationTags
      const description = [
        `Executive Summary\n${uploadForm.executiveSummary.trim()}`,
        `Details of Your Core Achievement in 2026 and Business Impact (including financial figures)\n${uploadForm.achievementImpact.trim()}`,
        `How You Demonstrate Bosch China Culture (Especially in Your Applied Category)\n${uploadForm.cultureDemonstration.trim()}`,
      ].join('\n\n')
      const uploadedImage = await StorageService.uploadFile(
        projectImage,
        'project-attachments',
        `nominations/${uploadForm.hackathonId}/${user.id}`
      )
      await IdeaService.createIdea({
        title: nomineeName,
        description,
        hackathonId: uploadForm.hackathonId,
        category: uploadForm.category.trim(),
        tags: technologies,
        status: 'submitted',
        projectAttachments: [{
          type: 'nomination',
          url: '',
          name: nomineeName,
          nomineeUserId,
        }, {
          type: 'screenshot',
          url: uploadedImage.url,
          name: projectImage.name,
          storageKey: uploadedImage.key,
        }],
      })

      notifications.show({
        title: 'Nomination submitted',
        message: 'The nomination is now available for review.',
        color: 'green',
      })
      setProjectImage(null)
      setUploadForm(emptyUploadForm())
      await loadProjects()
    } catch (error) {
      notifications.show({
        title: 'Submission failed',
        message: error instanceof ApiError || error instanceof Error
          ? error.message
          : 'Unable to submit the nomination',
        color: 'red',
      })
    } finally {
      setUploading(false)
    }
  }

  const showVotingRecords = () => {
    setCartOpened(false)
    setModalOpened(false)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', 'voting-records')
      return next
    })
  }

  const handleVote = (projectId: string) => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/projects?nominee=${projectId}`)}`)
      return
    }
    if (ballotBusy.current || loading || loadError) return
    const project = projects.find((item) => item.id === projectId)
    if (!project) return
    if (project.user_vote) {
      showVotingRecords()
      return
    }
    setVoteError(null)
    setCart((current) => {
      const ids = current.userId === user.id ? current.ids : []
      return { userId: user.id, ids: ids.includes(projectId) ? ids.filter((id) => id !== projectId) : [...ids, projectId] }
    })
  }

  const submitCart = async () => {
    if (!user || ballotBusy.current || loading || loadError) return
    const ids = projects.filter((project) => cartIds.has(project.id) && !project.user_vote).map((project) => project.id)
    if (!ids.length) return
    const sequence = loadSequence.current
    ballotBusy.current = true
    setSubmitting(true)
    setSubmissionState('submitting')
    setVoteError(null)
    try {
      // Keep the progress ring visible long enough to avoid a flash on fast responses.
      const [result] = await Promise.allSettled([
        IdeaService.submitVotes(ids),
        new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
      ])
      if (result.status === 'rejected') throw result.reason
      if (sequence !== loadSequence.current) return
      setCart({ userId: user.id, ids: [] })
      setProjects((current) => current.map((project) => ids.includes(project.id)
        ? { ...project, user_vote: true, votes: project.votes + 1 } : project))
      setSubmissionState('success')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500))
      if (sequence !== loadSequence.current) return
      setSubmissionState('idle')
      showVotingRecords()
      await loadProjects()
    } catch (error) {
      if (sequence !== loadSequence.current) return
      const message = error instanceof ApiError && error.status === 401
        ? 'Your session has expired. Sign in again to submit your cart.'
        : error instanceof ApiError && (error.status === 404 || error.status === 405)
          ? 'The submission service is unavailable. Please try again after the service has been updated.'
          : error instanceof Error ? error.message : 'Unable to submit your votes. Please try again.'
      setVoteError(message)
      setSubmissionState('error')
    } finally {
      ballotBusy.current = false
      setSubmitting(false)
    }
  }

  const deleteVotingRecord = async () => {
    if (!user || !recordToDelete || ballotBusy.current) return
    const sequence = loadSequence.current
    const id = recordToDelete.id
    ballotBusy.current = true
    setDeletingRecord(true)
    setRecordError(null)
    try {
      await IdeaService.deleteVoteRecord(id)
      if (sequence !== loadSequence.current) return
      setProjects((current) => current.map((project) => project.id === id
        ? { ...project, user_vote: false, votes: Math.max(0, project.votes - 1) } : project))
      setSelectedProject((project) => project?.id === id
        ? { ...project, user_vote: false, votes: Math.max(0, project.votes - 1) } : project)
      setCart((current) => ({ ...current, ids: current.ids.filter((item) => item !== id) }))
      setRecordToDelete(null)
      await loadProjects()
    } catch (error) {
      if (sequence !== loadSequence.current) return
      setRecordError(error instanceof Error ? error.message : 'Unable to delete your voting record. Please try again.')
    } finally {
      ballotBusy.current = false
      setDeletingRecord(false)
    }
  }

  useEffect(() => {
    if (!nomineeToOpen) { restoredNominee.current = null; return }
    if (loading || restoredNominee.current === nomineeToOpen) return
    const nomination = projects.find((project) => project.id === nomineeToOpen)
    if (nomination) {
      restoredNominee.current = nomineeToOpen
      setSelectedProject(nomination)
      setModalOpened(true)
    }
  }, [nomineeToOpen, loading, projects])

  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      const matchesSearch = project.title.toLowerCase().includes(filters.search.toLowerCase()) ||
                           project.description.toLowerCase().includes(filters.search.toLowerCase()) ||
                           project.nominee_name.toLowerCase().includes(filters.search.toLowerCase()) ||
                           project.nominee_org_code.toLowerCase().includes(filters.search.toLowerCase())
      
      const matchesCategory = !filters.category || project.category === filters.category
      const matchesDepartment = !filters.department || project.nominee_org_code.split('-')[0] === filters.department
      
      return matchesSearch && matchesCategory && matchesDepartment
    })
  }, [projects, filters])

  const submittedProjects = projects.filter((project) => project.user_vote)
  const votedProjects = projects.filter((project) => cartIds.has(project.id) && !project.user_vote)
  const departments = useMemo(
    () => [...new Set(projects.map((project) => project.nominee_org_code.split('-')[0]).filter(Boolean))].sort(),
    [projects]
  )
  const selectedNominationTrack = DIGITAL_PIONEER_TRACKS.find(
    (track) => track.value === uploadForm.category
  )

  const clearAllVotes = () => {
    if (!user || ballotBusy.current) return
    setCart({ userId: user.id, ids: [] })
    setVoteError(null)
  }

  const clearTrackVotes = (awardId: string, category: string) => {
    if (ballotBusy.current) return
    const ids = new Set(projects.filter((project) => project.hackathon_id === awardId && project.category === category).map((project) => project.id))
    setCart((current) => ({ ...current, ids: current.ids.filter((id) => !ids.has(id)) }))
    setVoteError(null)
  }

  const openProjectModal = (project: Project) => {
    setSelectedProject(project)
    setModalOpened(true)
    if (user?.role === 'participant' && !assignedJudgeHackathons.has(project.hackathon_id)) {
      void JudgingService.getJudges(project.hackathon_id).then((judges) => {
        if (judges.some((judge) => judge.userId === user.id)) {
          setAssignedJudgeHackathons((current) => new Set(current).add(project.hackathon_id))
        }
      }).catch(() => undefined)
    }
  }

  const requestDeletion = (targets: Project[]) => {
    if (!canDelete || deletingRef.current || !targets.length) return
    setDeleteError(null)
    setDeleteSuccess(null)
    setPendingDeletion(targets)
  }

  const confirmDeletion = async () => {
    if (!canDelete || deletingRef.current || !pendingDeletion.length) return
    deletingRef.current = true
    setDeleting(true)
    setDeleteError(null)
    const ids = pendingDeletion.map((project) => project.id)
    const sequence = loadSequence.current
    try {
      if (ids.length === 1) await IdeaService.deleteIdea(ids[0])
      else await IdeaService.deleteIdeas(ids)
      if (sequence !== loadSequence.current) return
      // Apply only committed deletions; all counts and the vote cart derive from this list.
      const deletedIds = new Set(ids)
      setProjects((current) => current.filter((project) => !deletedIds.has(project.id)))
      setSelectedIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))))
      if (selectedProject && deletedIds.has(selectedProject.id)) {
        setSelectedProject(null)
        setModalOpened(false)
      }
      setPendingDeletion([])
      setDeleteSuccess(language === 'zh' ? `已删除 ${ids.length} 条提名。` : `Deleted ${ids.length} nomination(s).`)
    } catch (error) {
      if (sequence !== loadSequence.current) return
      setDeleteError(error instanceof Error ? error.message : (language === 'zh' ? '删除失败，请重试。' : 'Unable to delete nominations. Please try again.'))
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  if (nominationMode) {
    return (
      <Container size={1240} py={{ base: 'md', md: 'xl' }} className="dp-page">
        <section className="dp-nomination-flow" aria-labelledby="track-choice-title">
          <div className="dp-flow-heading">
            <div>
              <Title id="track-choice-title" order={2}>Choose an award category</Title>
            </div>
          </div>

          <div className="dp-nomination-tracks" role="radiogroup" aria-label="Nomination track">
            {DIGITAL_PIONEER_TRACKS.map((track) => {
              const isSelected = track.value === uploadForm.category
              return (
                <UnstyledButton
                  key={track.value}
                  className="dp-track dp-nomination-track"
                  data-active={isSelected}
                  role="radio"
                  aria-checked={isSelected}
                  aria-controls="nomination-track-description nomination-form"
                  aria-expanded={isSelected}
                  onClick={() => setUploadForm((current) => ({ ...current, category: track.value }))}
                >
                  <span className="dp-nomination-track__topline">
                    <span aria-hidden="true" />
                    <span className="dp-nomination-track__check" aria-hidden="true">
                      {isSelected ? <IconCheck size={15} stroke={2.4} /> : null}
                    </span>
                  </span>
                  <span className="dp-nomination-track__name">{track.label}</span>
                  <span className="dp-nomination-track__description" lang="zh">{track.labelZh}</span>
                </UnstyledButton>
              )
            })}
          </div>

          {selectedNominationTrack && (
            <div id="nomination-track-description" className="dp-fieldset" translate="no" aria-live="polite">
              <Title order={3}>{selectedNominationTrack.label}</Title>
              <Text mt="sm" lang="zh">{selectedNominationTrack.labelZh}</Text>
              <AwardCriteriaList standards={selectedNominationTrack.standards} />
            </div>
          )}

          {!selectedNominationTrack ? (
            <div className="dp-track-gate" role="status">
              <Text fw={650}>Choose a track to begin</Text>
            </div>
          ) : loading ? (
            <div className="dp-track-gate" role="status">
              <Text fw={650}>Preparing the nomination form…</Text>
            </div>
          ) : hackathons.length === 0 ? (
            <Alert color="orange" icon={<IconInfoCircle size={18} />} mt="lg">
              No nomination window is currently open.
            </Alert>
          ) : (
            <Card className="dp-form-shell" p={{ base: 'lg', md: 38 }}>
              <Stack gap={0} id="nomination-form">
                  <Group className="dp-form-intro" justify="space-between" align="center" wrap="wrap">
                    <div>
                      <Title order={3}>{selectedNominationTrack.label}</Title>
                    </div>

                  </Group>
                  <div className="dp-fieldset" translate="no" style={{ borderTop: 0, paddingTop: 0 }}>
                    <Grid gutter="md">
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        {!user || user.role === 'participant' ? (
                          <TextInput label="Outlook Name" value={user?.name ?? ''} readOnly />
                        ) : (
                          <Select
                            label="Outlook Name"
                            searchable
                            required
                            data={nominees.length ? nominees.map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.email})` })) : [{ value: user.id, label: user.name }]}
                            value={uploadForm.nomineeUserId || user.id}
                            onChange={(value) => setUploadForm((current) => ({ ...current, nomineeUserId: value ?? user.id }))}
                          />
                        )}
                        {nomineeLoadError && <Text size="sm" c="red" role="alert">Unable to load associates. Refresh to retry; self-nomination is still available.</Text>}
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <FileInput
                          label={<><strong>Personal Photo</strong><span style={{ fontWeight: 400 }}>(JG, PNG or WebP; up to 50 MB per photo)</span></>}
                          styles={{ label: { whiteSpace: 'nowrap' } }}
                          required
                          accept={PHOTO_ACCEPT}
                          error={photoError ? (language === 'zh' ? (projectImage?.size === 0 ? '照片为空，请重新选择。' : projectImage && projectImage.size > MAX_UPLOAD_BYTES ? '照片超过 50 MB，请选择较小的图片。' : '请选择 JPG、PNG 或 WebP 格式的照片。') : photoError) : null}
                          leftSection={<IconPhoto size={16} />}
                          value={projectImage}
                          onChange={setProjectImage}
                          clearable
                        />
                      </Grid.Col>
                      <Grid.Col span={12}>
                        <Select
                          label="Award Category"
                          renderOption={({ option }) => <span translate="no">{option.label}</span>}
                          data={DIGITAL_PIONEER_TRACKS.map((track) => ({ value: track.value, label: track.label }))}
                          value={uploadForm.category}
                          allowDeselect={false}
                          onChange={(value) => {
                            if (value) setUploadForm((current) => ({ ...current, category: value }))
                          }}
                        />
                      </Grid.Col>
                    </Grid>
                  </div>

                  <div className="dp-fieldset" translate="no">
                    <div className="dp-nomination-question">
                      <div style={{ minWidth: 0 }}>
                        <Textarea
                          label={<><span className="dp-question-number" aria-hidden="true">01</span><span>Executive Summary (The Elevator Pitch)</span></>}
                          required
                          minRows={4}
                          maxLength={1200}
                          value={uploadForm.executiveSummary}
                          onChange={(event) => setUploadForm((current) => ({ ...current, executiveSummary: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="dp-fieldset" translate="no">
                    <div className="dp-nomination-question">
                      <div style={{ minWidth: 0 }}>
                        <Textarea
                          label={<><span className="dp-question-number" aria-hidden="true">02</span><span>Details of Your Core Achievement in 2026 and Business Impact (including financial figures)</span></>}
                          required
                          minRows={4}
                          maxLength={2400}
                          value={uploadForm.achievementImpact}
                          onChange={(event) => setUploadForm((current) => ({ ...current, achievementImpact: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="dp-fieldset" translate="no">
                    <div className="dp-nomination-question">
                      <div style={{ minWidth: 0 }}>
                        <Textarea
                          label={<><span className="dp-question-number" aria-hidden="true">03</span><span>How you demonstrate BD China culture (especially on you applied category) ?</span></>}
                          required
                          minRows={4}
                          maxLength={2000}
                          value={uploadForm.cultureDemonstration}
                          onChange={(event) => setUploadForm((current) => ({ ...current, cultureDemonstration: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="dp-fieldset" translate="no">
                    <div className="dp-nomination-question">
                      <div style={{ minWidth: 0 }}>
                        <TextInput
                          label={<><span className="dp-question-number" aria-hidden="true">04</span><span>Tags you want to add(Add up to 5 tags, separated by 、, ， or commas (,))</span></>}
                          styles={{ label: { whiteSpace: 'nowrap' } }}
                          error={tooManyTags ? tagHint : undefined}
                          value={uploadForm.technologies}
                          onChange={(event) => setUploadForm((current) => ({ ...current, technologies: event.target.value }))}
                        />
                        <Text size="xs" c={tooManyTags ? 'red' : 'dimmed'} mt={6} aria-live="polite">{nominationTags.length} / 5</Text>
                        <Group gap={6} mt="xs" className="dp-nomination-tags">
                          {nominationTags.map((tag) => <Badge key={tag} size="sm" variant="light" title={tag}>{tag}</Badge>)}
                        </Group>
                      </div>
                    </div>
                  </div>

                  {!canNominate && <Text size="sm" c="dimmed">{language === 'zh' ? '仅管理员和评选管理者可提交报名。' : 'Only administrators and award managers can submit nominations.'}</Text>}
                  <Group justify="flex-end" align="center" pt="lg">
                    <Button
                      className="dp-primary-button"
                      rightSection={<IconArrowRight size={17} />}
                      onClick={() => void handleProjectUpload()}
                      loading={uploading}
                      disabled={!canNominate || tooManyTags || Boolean(photoError)}
                    >
                      Submit nomination
                    </Button>
                  </Group>
                </Stack>
            </Card>
          )}
        </section>
      </Container>
    )
  }

  return (
    <Container size={1240} pt={{ base: 'sm', md: 'lg' }} className={`dp-page dp-voting-page${cartOpened ? ' dp-voting-page--cart-open' : ''}`}>
      <Stack gap="lg">
        {loadError && <Alert color="red" title="Unable to load nominations"><Button variant="subtle" onClick={() => void loadProjects()}>Retry</Button></Alert>}
        <div className="dp-selection-header">
          <Group justify="space-between" align="center">
            <div>
              <h1 className="dp-section-title dp-selection-title">{canDelete ? (language === 'zh' ? '提名管理' : 'Manage nominees') : <>Meet this year&apos;s nominees</>}</h1>
            </div>
          </Group>
        </div>

        {user && !canDelete && <details className="dp-voting-rules">
          <summary>{language === 'zh' ? '查看投票规则' : 'Voting rules'}</summary>
          <ul>
            <li>{language === 'zh' ? '每人每赛道最多4票，各赛道独立计算；每位候选人最多1票，再次点击即可取消。' : 'Up to 4 votes per person per category. Each nominee receives at most one of your votes; add your selections to the cart, then click Submit.'}</li>
            <li>{language === 'zh' ? '本部门最多2票，其他部门合计最多2票；两组额度独立，均可投0、1或2票。' : 'Up to 2 votes for your department and up to 2 votes in total for other departments. Each allowance is independent and may be used for 0, 1 or 2 votes.'}</li>
            <li>{language === 'zh' ? '每赛道可投0–4票，无需投满；投票和撤票均不限制先后顺序。' : 'You may cast 0–4 votes per category. You do not have to use all votes, and may submit or delete voting records in any order.'}</li>
            <li>{language === 'zh' ? '投票账号和候选人须能唯一匹配BD名册，部门按Org.code中“-”前的部分识别，例如BD/DPA-SRE3属于BD/DPA。' : 'Voters and nominees must uniquely match the BD roster. Department is the Org.code prefix before “-”, e.g. BD/DPA-SRE3 belongs to BD/DPA.'}</li>
          </ul>
        </details>}

        <div className="dp-category-tabs" role="group" aria-label="Filter by award category">
          <UnstyledButton
            className="dp-category-tab"
            data-active={filters.category === ''}
            aria-pressed={filters.category === ''}
            onClick={() => setFilters((current) => ({ ...current, category: '' }))}
          >
            <span>All nominees</span>
            <span className="dp-category-tab__count">{projects.length}</span>
          </UnstyledButton>
          {DIGITAL_PIONEER_TRACKS.map((track) => (
            <UnstyledButton
              key={track.value}
              className="dp-category-tab"
              data-active={filters.category === track.value}
              aria-pressed={filters.category === track.value}
              onClick={() => setFilters((current) => ({ ...current, category: track.value }))}
            >
              <span>{track.label}</span>
              <span className="dp-category-tab__count">
                {projects.filter((project) => project.category === track.value).length}
              </span>
            </UnstyledButton>
          ))}
        </div>

        {!nominationMode && (
        <>
        <Card className="dp-filter-shell" p="sm">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <TextInput
                placeholder="Search nominees"
                leftSection={<IconSearch size={16} />}
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
              <Select
                placeholder="Filter by department"
                aria-label="Filter by department"
                data={departments}
                value={filters.department || null}
                onChange={(value) => setFilters(prev => ({ ...prev, department: value || '' }))}
                searchable
                clearable
              />
          </SimpleGrid>
        </Card>

        {canDelete && <Stack gap="sm">
          <Group justify="space-between">
            <Checkbox
              label={language === 'zh' ? `全选当前结果（${filteredProjects.length}）` : `Select all results (${filteredProjects.length})`}
              styles={{ label: { color: '#d9e1ec' } }}
              checked={filteredProjects.length > 0 && filteredProjects.every((project) => selectedIds.has(project.id))}
              indeterminate={filteredProjects.some((project) => selectedIds.has(project.id)) && !filteredProjects.every((project) => selectedIds.has(project.id))}
              disabled={loading || loadError || deleting || !filteredProjects.length}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setSelectedIds((current) => {
                  const next = new Set(current)
                  filteredProjects.forEach((project) => { if (checked) next.add(project.id); else next.delete(project.id) })
                  return next
                })
              }}
            />
            <Group gap="sm">
              <Button color="red" variant="outline" disabled={loading || loadError || deleting || !selectedIds.size}
                onClick={() => requestDeletion(projects.filter((project) => selectedIds.has(project.id)))}>
                {language === 'zh' ? `删除选中（${selectedIds.size}）` : `Delete selected (${selectedIds.size})`}
              </Button>
              <Button color="red" leftSection={<IconTrash size={16} />} disabled={loading || loadError || deleting || !projects.length}
                onClick={() => requestDeletion(projects)}>
                {language === 'zh' ? `一键删除全部（${projects.length}）` : `Delete all (${projects.length})`}
              </Button>
            </Group>
          </Group>
          {deleteSuccess && <Text c="#d9e1ec" role="status">{deleteSuccess}</Text>}
        </Stack>}

        <SimpleGrid className="dp-project-grid" cols={{ base: 1, sm: 2 }} spacing="md">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="dp-project-card" h={330} p="lg">
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text c="dimmed">Loading nominations…</Text>
                </div>
              </Card>
            ))
          ) : filteredProjects.length > 0 ? (
            filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="dp-project-card"
                data-voted={project.user_vote || cartIds.has(project.id) ? 'true' : undefined}
                p={0}
              >
                <div className="dp-candidate-layout">
                  <div className="dp-card-visual">
                    {project.images[0] ? (
                      <Image
                        src={project.images[0]}
                        alt={`${project.nominee_name} nomination`}
                        className="dp-candidate-photo"
                        fit="contain"
                      />
                    ) : (
                      <div className="dp-nominee-placeholder">
                        <IconUser size={24} />
                        <Text c="dimmed" size="sm">Nominee photo</Text>
                      </div>
                    )}
                    {project.user_vote ? (
                      <div className="dp-vote-stamp" role="status">
                        <IconThumbUpFilled size={14} />
                        <span>Voted</span>
                      </div>
                    ) : null}
                    <Button className="dp-candidate-details-link" size="compact-sm" variant="subtle" onClick={() => openProjectModal(project)}>
                      View details
                    </Button>
                  </div>

                  <div className="dp-candidate-info">
                  <div className="dp-candidate-scroll" tabIndex={0} role="region" aria-label={language === 'zh' ? `${project.nominee_name} 的报名信息` : `Nomination information for ${project.nominee_name}`}>
                  {canDelete && <Checkbox mb="sm" checked={selectedIds.has(project.id)} disabled={deleting}
                    styles={{ label: { color: 'inherit' } }}
                    label={language === 'zh' ? `选择 ${project.title}` : `Select ${project.title}`}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked
                      setSelectedIds((current) => {
                        const next = new Set(current)
                        if (checked) next.add(project.id); else next.delete(project.id)
                        return next
                      })
                    }} />}
                  <Title order={3} translate="no">{project.title}</Title>
                  <Text className="dp-candidate-summary-title" fw={700} mt="md">Summary</Text>
                  <Text size="sm" className="dp-candidate-description" tabIndex={0} role="region" aria-label={`${project.nominee_name} Summary`}>{nominationSummary(project.description)}</Text>

                  <Group gap={6} className="dp-nomination-tags" translate="no">
                    {project.technologies.map((tech) => (
                      <Badge key={tech} size="sm" variant="light" title={tech}>
                        {tech}
                      </Badge>
                    ))}
                  </Group>

                  </div>
                  <Group className="dp-candidate-actions" justify="space-between" align="center" wrap="wrap">
                    <Group gap={6}>
                      {project.github_url && (
                        <ActionIcon
                          component="a"
                          href={project.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="light"
                          size="sm"
                          aria-label="Open evidence"
                        >
                          <IconBrandGithub size={14} />
                        </ActionIcon>
                      )}
                      {project.demo_url && (
                        <ActionIcon
                          component="a"
                          href={project.demo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="light"
                          size="sm"
                          aria-label="Open additional evidence"
                        >
                          <IconWorldWww size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                    {canDelete ? <Button color="red" leftSection={<IconTrash size={16} />} disabled={deleting || loading || loadError}
                      aria-label={language === 'zh' ? `删除 ${project.title}` : `Delete ${project.title}`}
                      onClick={() => requestDeletion([project])}>
                      {language === 'zh' ? '删除' : 'Delete'}
                    </Button> : <Button
                      className="dp-vote-button"
                      disabled={submitting || deletingRecord}
                      data-voted={project.user_vote || cartIds.has(project.id) ? 'true' : 'false'}
                      variant={project.user_vote || cartIds.has(project.id) ? 'filled' : 'default'}
                      leftSection={project.user_vote ? <IconThumbUpFilled size={16} /> : <IconThumbUp size={16} />}
                      aria-label={project.user_vote ? `Submitted, ${project.votes} votes` : cartIds.has(project.id) ? `In cart, ${project.votes} votes` : `Vote, ${project.votes} votes`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleVote(project.id)
                      }}
                    >
                      {project.user_vote ? 'Submitted' : cartIds.has(project.id) ? 'In cart' : 'Vote'} ({project.votes})
                    </Button>}
                  </Group>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1' }}>
              <Center py="xl">
                <Stack align="center">
                  <ThemeIcon size={60} variant="light" color="gray">
                    <IconTrophy size={30} />
                  </ThemeIcon>
                  <Text c="dimmed">No nominations match these filters.</Text>
                  <Button leftSection={<IconUpload size={16} />} onClick={() => navigate('/nominate')}>
                    New nomination
                  </Button>
                </Stack>
              </Center>
            </div>
          )}
        </SimpleGrid>
        </>
        )}

        {!canDelete && <Button
          className="dp-vote-cart-button"
          leftSection={<IconThumbUp size={22} />}
          rightSection={<Badge className="dp-vote-cart-count" variant="filled">{votedProjects.length}</Badge>}
          aria-label={language === 'zh' ? `我的点赞（${votedProjects.length}）` : `My votes (${votedProjects.length})`}
          aria-controls="vote-cart"
          aria-haspopup="dialog"
          aria-expanded={cartOpened}
          onClick={() => setCartOpened((opened) => !opened)}
        >
          {language === 'zh' ? '我的点赞' : 'My votes'}
        </Button>}

        {cartOpened && <section
          id="vote-cart"
          className="dp-vote-cart-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="vote-cart-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              closeVoteCart()
            }
          }}
        >
          <Group className="dp-vote-cart-header" justify="space-between" wrap="nowrap" gap={6}>
            <Title order={2} size="h4" id="vote-cart-title" aria-live="polite">{language === 'zh' ? `我的点赞（${votedProjects.length}）` : `My votes (${votedProjects.length})`}</Title>
            <Button size="compact-xs" variant="light" loading={submitting} style={{ flexShrink: 0 }}
              disabled={!user || loading || loadError || deletingRecord || !votedProjects.length}
              onClick={() => void submitCart()}>Submit</Button>
            <Group gap={4} wrap="nowrap">
            <Button variant="subtle" color="red" c="#ffb1b1" size="compact-xs"
              disabled={!votedProjects.length || submitting || deletingRecord || loading}
              leftSection={<IconTrash size={14} />} onClick={() => void clearAllVotes()}>
              {language === 'zh' ? '一键清空' : 'Clear all'}
            </Button>
            <CloseButton aria-label={language === 'zh' ? '关闭我的点赞' : 'Close my votes'} onClick={closeVoteCart} />
            </Group>
          </Group>
          <div className="dp-vote-cart-body">
          <Stack gap="md">
            <Text size="sm" c="dimmed">{language === 'zh' ? '点赞后自动保存，可继续浏览候选人并点赞。每赛道最多4票：本部门和其他部门各最多2票，均可少投或不投。' : 'Selections stay in your cart until you click Submit. Submitted votes are available in My voting records from your account menu. Up to 4 votes per category: up to 2 for your department and 2 for other departments. Either allowance may be partly or entirely unused.'}</Text>
            {voteError && <Alert color="red" styles={{ root: { background: 'transparent' }, message: { color: '#fff' } }} role="alert">{voteError}</Alert>}
            {user && !loading && !loadError && hackathons.filter((award) => projects.some((project) => project.hackathon_id === award.id)).map((award) => (
              <section key={award.id} className="dp-ballot-summary" aria-label={language === 'zh' ? `${award.title} 已投票数` : `Saved votes for ${award.title}`}>
                <Text size="sm" fw={700}>{award.title}</Text>
                {DIGITAL_PIONEER_TRACKS.map((track) => {
                  const count = votedProjects.filter((project) => project.hackathon_id === award.id && project.category === track.value).length
                  return <Group key={track.value} justify="space-between" wrap="nowrap" gap="xs" mt="xs">
                    <Text size="xs">{language === 'zh' ? track.labelZh : track.label} · {count}/{DIGITAL_PIONEER_VOTING_RULES.votesPerTrack}</Text>
                    <Button variant="subtle" size="compact-xs" c="#c9d8ee" disabled={!count || submitting || deletingRecord}
                      aria-label={language === 'zh' ? `清空 ${award.title} ${track.labelZh} 点赞` : `Clear ${award.title} ${track.label} votes`}
                      onClick={() => void clearTrackVotes(award.id, track.value)}>
                      {language === 'zh' ? '清空本赛道' : 'Clear category'}
                    </Button>
                  </Group>
                })}
              </section>
            ))}
            {loadError ? (
              <Alert color="red"><Text>Unable to load nominations</Text><Button variant="subtle" onClick={() => void loadProjects()}>Retry</Button></Alert>
            ) : loading ? (
              <Text c="dimmed">Loading nominations…</Text>
            ) : !user ? (
              <Stack align="center" py="xl">
                <IconThumbUp size={40} />
                <Text>{language === 'zh' ? '登录后查看已点赞的候选人' : 'Sign in to view your votes'}</Text>
                <Button onClick={() => navigate('/login?redirect=%2Fprojects')}>{language === 'zh' ? '登录' : 'Sign in'}</Button>
              </Stack>
            ) : votedProjects.length === 0 ? (
              <Stack align="center" py="xl">
                <IconThumbUp size={40} />
                <Text>Your cart is empty.</Text>
                <Button variant="light" onClick={closeVoteCart}>{language === 'zh' ? '继续浏览候选人' : 'Browse nominees'}</Button>
              </Stack>
            ) : votedProjects.map((project) => (
              <div className="dp-vote-cart-item" key={project.id}>
                <Group wrap="nowrap" align="flex-start">
                  <Avatar src={project.images[0]} alt={project.nominee_name} size={56} radius="md"><IconUser /></Avatar>
                  <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={700} style={{ overflowWrap: 'anywhere' }} translate="no">{project.title}</Text>
                    {project.nominee_name.trim() !== project.title.trim() && <Text size="sm" translate="no">{project.nominee_name}</Text>}
                    <Badge variant="light" w="fit-content" maw="100%">{project.category}</Badge>
                    <Text size="sm" c="dimmed"><span>Department</span>: <span translate="no">{project.nominee_org_code.split('-')[0] || '—'}</span></Text>
                  </Stack>
                </Group>
                <Group justify="space-between" mt="sm">
                  <Button variant="subtle" size="xs" onClick={() => { setCartOpened(false); openProjectModal(project) }}>View details</Button>
                  <Button
                    variant="light"
                    color="red"
                    c="#ffb1b1"
                    size="xs"
                    leftSection={<IconTrash size={15} />}
                    disabled={submitting || deletingRecord}
                    aria-label={`Remove ${project.title} from cart`}
                    onClick={() => void handleVote(project.id)}
                  >Remove from cart</Button>
                </Group>
              </div>
            ))}
          </Stack>
          </div>
        </section>}

        <Modal opened={submissionState !== 'idle'} zIndex={400} centered size="sm"
          title={submissionState === 'error' ? 'Votes not submitted' : 'Submit votes'}
          onClose={() => { if (submissionState === 'error') setSubmissionState('idle') }}
          closeOnClickOutside={false} closeOnEscape={submissionState === 'error'}
          withCloseButton={submissionState === 'error'}
          classNames={{ content: 'dp-submit-feedback', header: 'dp-submit-feedback-header' }}>
          <Stack align="center" gap="md" py="md">
            {submissionState !== 'error' ? <>
              <div className="dp-submit-animation" data-state={submissionState} aria-hidden="true">
                <svg viewBox="0 0 80 80" fill="none">
                  <circle className="dp-submit-ring-track" cx="40" cy="40" r="32" />
                  <circle className="dp-submit-ring" cx="40" cy="40" r="32" />
                  {submissionState === 'success' && <path className="dp-submit-check" d="M25 40l10 10 21-22" />}
                </svg>
              </div>
              <Text role="status" fw={600}>{submissionState === 'success' ? 'Votes submitted' : 'Submitting your votes…'}</Text>
              <Text size="sm" ta="center">{submissionState === 'success' ? 'Opening your voting records…' : 'Please wait while your votes are saved.'}</Text>
            </> : <>
              <Alert color="red" role="alert" w="100%"
                styles={{ root: { backgroundColor: 'transparent' }, message: { color: '#fff', fontWeight: 700 } }}>{voteError}</Alert>
              <Text size="sm" ta="center">Your cart has been kept. Review the message above before trying again.</Text>
              <Group justify="center">
                <Button variant="light" onClick={() => {
                  setSubmissionState('idle')
                  setCartOpened(true)
                  document.querySelector('.dp-vote-cart-body')?.scrollTo({ top: 0, behavior: 'smooth' })
                }}>Back to cart</Button>
                <Button variant="subtle" onClick={() => { setSubmissionState('idle'); showVotingRecords() }}>My voting records</Button>
              </Group>
            </>}
          </Stack>
        </Modal>

        <Modal opened={recordsOpened} zIndex={310} onClose={closeVotingRecords} title="My voting records" size="lg" centered>
          <Stack>
            {!user ? <Text>Sign in to view your voting records.</Text>
              : loading ? <Text role="status">Loading voting records…</Text>
              : loadError ? <Alert color="red" title="Unable to load voting records">
                <Button variant="subtle" onClick={() => void loadProjects()}>Retry</Button>
              </Alert>
              : <>
                <Text role="status">Your submitted votes are saved to the database. You can view them here anytime from your account menu.</Text>
                <Text size="sm" c="dimmed">To change a submitted vote, delete its record, then add your new selection to the cart and submit again.</Text>
                {submittedProjects.length === 0 ? <Text>No submitted votes yet.</Text> : submittedProjects.map((project) => (
                  <Card key={project.id} withBorder>
                    <Group justify="space-between" wrap="nowrap" mb="sm">
                      <Avatar src={project.images[0]} alt={project.nominee_name} size={48} radius="md"><IconUser /></Avatar>
                      <Button color="red" variant="light" size="xs" leftSection={<IconTrash size={14} />}
                        aria-label={`Delete voting record for ${project.title}`} disabled={deletingRecord || submitting}
                        onClick={() => { setRecordError(null); setRecordToDelete(project) }}>Delete</Button>
                    </Group>
                    <Stack gap={4} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <Text fw={700} translate="no">{project.title}</Text>
                      {project.nominee_name !== project.title && <Text size="sm" translate="no">{project.nominee_name}</Text>}
                      <Text size="sm">{hackathons.find((award) => award.id === project.hackathon_id)?.title}</Text>
                      <Text size="sm">{DIGITAL_PIONEER_TRACKS.find((track) => track.value === project.category)?.label ?? project.category}</Text>
                      <Text size="sm">Department: <span translate="no">{project.nominee_org_code.split('-')[0] || '—'}</span></Text>
                      <Button variant="subtle" size="xs" onClick={() => { closeVotingRecords(); openProjectModal(project) }}>View details</Button>
                    </Stack>
                  </Card>
                ))}
              </>}
            <Button variant="light" onClick={closeVotingRecords}>Back to nominees</Button>
          </Stack>
        </Modal>

        <Modal opened={recordToDelete !== null} onClose={() => { if (!deletingRecord) setRecordToDelete(null) }}
          title="Delete voting record?" centered zIndex={310} closeOnClickOutside={!deletingRecord}
          closeOnEscape={!deletingRecord} withCloseButton={!deletingRecord}>
          <Stack>
            <Text>Delete your submitted vote for <span translate="no">{recordToDelete?.title}</span>? This action cannot be undone.</Text>
            <Text size="sm" c="dimmed">You can select a nominee and submit a new vote after deleting this record.</Text>
            {recordError && <Alert color="red" role="alert">{recordError}</Alert>}
            <Group justify="flex-end">
              <Button variant="default" disabled={deletingRecord} onClick={() => setRecordToDelete(null)}>Cancel</Button>
              <Button color="red" loading={deletingRecord} onClick={() => void deleteVotingRecord()}>Delete permanently</Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={canDelete && pendingDeletion.length > 0}
          onClose={() => { if (!deleting) setPendingDeletion([]) }}
          title={language === 'zh' ? '确认删除提名' : 'Confirm nomination deletion'}
          centered
          closeOnClickOutside={false}
          closeOnEscape={!deleting}
          withCloseButton={!deleting}
          classNames={{ content: 'dp-candidate-modal', header: 'dp-candidate-modal-header' }}
        >
          <Stack>
            <Text>{language === 'zh'
              ? `即将永久删除 ${pendingDeletion.length} 条提名及其关联的投票、评论和评分，无法撤销。`
              : `Permanently delete ${pendingDeletion.length} nomination(s) and their votes, comments and scores? This cannot be undone.`}</Text>
            <Stack gap="xs" mah={200} style={{ overflowY: 'auto' }}>
              {pendingDeletion.map((project) => <Text key={project.id} size="sm" translate="no" style={{ overflowWrap: 'anywhere' }}>{project.title} · {project.category}</Text>)}
            </Stack>
            {deleteError && <Text c="red.3" role="alert">{deleteError}</Text>}
            <Group justify="flex-end">
              <Button variant="default" disabled={deleting} onClick={() => setPendingDeletion([])}>{language === 'zh' ? '取消' : 'Cancel'}</Button>
              <Button color="red" loading={deleting} onClick={() => void confirmDeletion()}>{language === 'zh' ? '确认删除' : 'Confirm delete'}</Button>
            </Group>
          </Stack>
        </Modal>

        {/* Project Detail Modal */}
        <Modal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          title={selectedProject?.title}
          size="xl"
          classNames={{ content: 'dp-candidate-modal', header: 'dp-candidate-modal-header' }}
        >
        {selectedProject && (
          <Stack gap="md">
            {selectedProject.images[0] ? (
              <Image
                src={selectedProject.images[0]}
                alt={`${selectedProject.nominee_name} nomination`}
                className="dp-candidate-detail-photo"
                radius="md"
                fit="contain"
              />
            ) : (
              <div style={{ height: 300, backgroundColor: '#f8f9fa', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text c="dimmed">Nominee photo</Text>
              </div>
            )}

            {/* Description */}
            <div className="dp-candidate-detail-sections">
              {parseNominationDescription(selectedProject.description).map((section, index) => (
                <section className="dp-candidate-detail-section" key={index}>
                  {section.heading && <Title order={3} className="dp-candidate-detail-heading">{section.heading}</Title>}
                  {section.body.split(/\n\s*\n/).map((paragraph, paragraphIndex) => (
                    <Text className="dp-candidate-detail-paragraph" key={paragraphIndex}>{paragraph}</Text>
                  ))}
                </section>
              ))}
            </div>
            <Badge variant="light" w="fit-content">{selectedProject.category}</Badge>

            {/* Individual nominee */}
            <div>
              <Title order={5} mb="sm">Nominee</Title>
              <Group>
                {([{ id: selectedProject.id, name: selectedProject.nominee_name, role: undefined }]).map((member) => (
                  <Group key={member.id} gap="xs">
                    <Avatar size="sm" />
                    <div>
                      <Text size="sm" fw={500} translate="no">{member.name}</Text>
                      <Text size="sm" c="dimmed"><span>Department</span>: <span translate="no">{selectedProject.nominee_org_code.split('-')[0] || '—'}</span></Text>
                      <Text size="sm" c="dimmed"><span>Org. code</span>: <span translate="no">{selectedProject.nominee_org_code || '—'}</span></Text>
                      {member.role && <Text size="sm" c="dimmed">{member.role}</Text>}
                    </div>
                  </Group>
                ))}
              </Group>
            </div>

            <div>
              <Title order={5} mb="sm">Tags</Title>
              <Group>
                {selectedProject.technologies.map((tech) => (
                  <Badge key={tech} variant="light">
                    {tech}
                  </Badge>
                ))}
              </Group>
            </div>

            {/* Links */}
            <Group>
              {selectedProject.github_url && (
                <Button
                  component="a"
                  href={selectedProject.github_url}
                  target="_blank"
                  leftSection={<IconBrandGithub size={16} />}
                  variant="light"
                >
                  View Evidence
                </Button>
              )}
              {selectedProject.demo_url && (
                <Button
                  component="a"
                  href={selectedProject.demo_url}
                  target="_blank"
                  leftSection={<IconExternalLink size={16} />}
                  variant="light"
                >
                  Additional evidence
                </Button>
              )}
              {(user?.role === 'admin' || user?.role === 'manager'
                || assignedJudgeHackathons.has(selectedProject.hackathon_id)) && (
                <Button
                  leftSection={<IconGavel size={16} />}
                  variant="light"
                  color="grape"
                  onClick={() => navigate(`/hackathons/${selectedProject.hackathon_id}/judge`)}
                >
                  Committee scoring
                </Button>
              )}
            </Group>

            {/* Vote Button */}
            <Button
              fullWidth
              disabled={submitting || deletingRecord || loading}
              leftSection={selectedProject.user_vote ? <IconThumbUpFilled size={16} /> : <IconThumbUp size={16} />}
              variant={selectedProject.user_vote ? 'filled' : 'light'}
              color="red"
              onClick={() => handleVote(selectedProject.id)}
            >
              {selectedProject.user_vote ? 'View voting record' : cartIds.has(selectedProject.id) ? 'Remove from cart' : 'Add to cart'} ({selectedProject.votes})
            </Button>



          </Stack>
        )}
      </Modal>

      </Stack>
    </Container>
  )
}
