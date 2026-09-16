/** Follow server page counts so selection controls never silently truncate associates or cases. */
export async function getAllPages<T>(fetchPage: (page: number) => Promise<{ content: T[]; totalPages?: number }>): Promise<T[]> {
  const first = await fetchPage(0)
  const result = [...first.content]
  // Bound concurrency and preserve page order even if responses arrive out of order.
  const totalPages = first.totalPages ?? 1
  for (let page = 1; page < totalPages; page += 4) {
    const pages = await Promise.all(Array.from(
      { length: Math.min(4, totalPages - page) },
      (_, offset) => fetchPage(page + offset),
    ))
    for (const next of pages) result.push(...next.content)
  }
  return result
}
