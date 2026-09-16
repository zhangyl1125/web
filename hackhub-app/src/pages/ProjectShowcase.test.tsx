import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import { ProjectShowcase } from './ProjectShowcase'
import { ProfileService } from '../services/profileService'
import { StorageService } from '../services/storageService'
import { TeamService } from '../services/teamService'

const { createIdea, createTeam, getOrCreateNominationTeam, getComments, addComment, getIdeas, getHackathons, updateIdea, uploadFile, voteIdea, clearMyVotes, clearTrackVotes, submitVotes, deleteVoteRecord, deleteIdea, deleteIdeas, currentUser, listNominees } = vi.hoisted(() => ({
  submitVotes: vi.fn().mockResolvedValue(undefined),
  deleteVoteRecord: vi.fn().mockResolvedValue(undefined),
  deleteIdea: vi.fn().mockResolvedValue(undefined),
  deleteIdeas: vi.fn().mockResolvedValue(undefined),
  currentUser: { id: 'user-1', email: 'user@example.com', name: 'User', role: 'participant' as 'participant' | 'manager' | 'admin', skills: [] },
  listNominees: vi.fn().mockResolvedValue({ content: [{ id: 'nominee-2', name: 'Named Associate', email: 'associate@example.com' }] }),
  getHackathons: vi.fn().mockResolvedValue({ content: [{ id: 'hackathon-1', title: 'Spring 2026 Hackathon', status: 'running' }] }),
  createIdea: vi.fn().mockResolvedValue({ id: 'new-idea' }),
  getOrCreateNominationTeam: vi.fn().mockResolvedValue({ id: 'personal-team', name: 'User nomination' }),
  getComments: vi.fn().mockResolvedValue([{ id: 'comment-1', ideaId: 'idea-1', userId: 'reviewer', content: 'The customer impact is well documented.', createdAt: '2026-09-01T00:00:00Z' }]),
  addComment: vi.fn().mockResolvedValue(undefined),
  createTeam: vi.fn().mockResolvedValue({ id: 'personal-team', name: 'User nomination' }),
  getIdeas: vi.fn().mockResolvedValue({
    content: [{
      id: 'idea-1',
      title: 'Customer Portal Renewal',
      description: 'Uploaded by an administrator',
      teamId: 'team-1',
      createdBy: 'user-1',
      category: 'AI',
      tags: ['Java'],
      attachments: [],
      projectAttachments: [],
      votes: 2,
      userHasVoted: false,
      status: 'submitted',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    }],
  }),
  updateIdea: vi.fn().mockResolvedValue({ id: 'new-idea' }),
  uploadFile: vi.fn().mockResolvedValue({ url: '/image.jpg', key: 'projects/personal-team/image.jpg' }),
  clearTrackVotes: vi.fn().mockResolvedValue(undefined),
  clearMyVotes: vi.fn().mockResolvedValue(undefined),
  voteIdea: vi.fn().mockResolvedValue({ voted: true, voteCount: 3 }),
}))

Element.prototype.scrollIntoView = vi.fn()
Element.prototype.scrollTo = vi.fn()

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user: currentUser }) }))
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))
vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return { ...actual, api: { ...actual.api, get: listNominees } }
})

vi.mock('../services/hackathonService', () => ({
  HackathonService: {
    getHackathons,
  },
}))

vi.mock('../services/ideaService', () => ({
  IdeaService: {
    getIdeas,
    voteIdea,
    clearMyVotes,
    submitVotes,
    deleteVoteRecord,
    clearTrackVotes,
    createIdea,
    getComments,
    addComment,
    updateIdea,
    deleteIdea,
    deleteIdeas,
  },
}))

vi.mock('../services/teamService', () => ({
  TeamService: {
    getTeams: vi.fn().mockResolvedValue([{ id: 'team-1', name: 'Admin Team', hackathonId: 'hackathon-1' }]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
    createTeam,
    getOrCreateNominationTeam,
  },
}))

vi.mock('../services/profileService', () => ({
  ProfileService: { getProfile: vi.fn().mockResolvedValue({ name: 'Reviewer' }) },
}))

vi.mock('../services/storageService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/storageService')>(),
  StorageService: {
    getPresignedUrl: vi.fn(),
    uploadFile,
  },
}))

vi.mock('../services/judgingService', () => ({
  JudgingService: { getJudges: vi.fn().mockResolvedValue([]) },
}))

describe('ProjectShowcase', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })
  afterEach(() => { currentUser.role = 'participant' })
  it('shares duplicate profile and image requests within a load, then refreshes them on remount', async () => {
    const page = { content: [1, 2].map((id) => ({
      id: `shared-${id}`, title: `Shared nominee ${id}`, description: 'Shared assets',
      createdBy: 'shared-user', category: 'Customer Values', tags: [], attachments: [],
      projectAttachments: [{ type: 'screenshot', storageKey: 'shared-photo', url: '/fallback.jpg' }],
      votes: 0, userHasVoted: false, status: 'submitted',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    })) }
    getIdeas.mockResolvedValueOnce(page).mockResolvedValueOnce(page)
    vi.mocked(StorageService.getPresignedUrl).mockResolvedValue('/shared-photo.jpg')
    const show = () => render(<MantineProvider><MemoryRouter><ProjectShowcase /></MemoryRouter></MantineProvider>)
    const first = show()
    await screen.findByText('Shared nominee 2')
    expect(ProfileService.getProfile).toHaveBeenCalledTimes(1)
    expect(StorageService.getPresignedUrl).toHaveBeenCalledTimes(1)
    expect(TeamService.getTeamMembers).not.toHaveBeenCalled()
    first.unmount()
    show()
    await screen.findByText('Shared nominee 2')
    expect(ProfileService.getProfile).toHaveBeenCalledTimes(2)
    expect(StorageService.getPresignedUrl).toHaveBeenCalledTimes(2)
  })

  it('uses nomination metadata without requesting an unused creator profile', async () => {
    getIdeas.mockResolvedValueOnce({ content: [{
      id: 'named-nominee', title: 'Named nominee', description: 'Nomination with metadata',
      createdBy: 'creator', category: 'Customer Values', tags: [], attachments: [],
      projectAttachments: [{ type: 'nomination', name: 'Named Associate', nomineeOrgCode: 'BDCN' }],
      votes: 0, userHasVoted: false, status: 'submitted',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }] })
    render(<MantineProvider><MemoryRouter><ProjectShowcase /></MemoryRouter></MantineProvider>)
    await screen.findByText('Named nominee')
    expect(ProfileService.getProfile).not.toHaveBeenCalled()
  })

  it('shows nominees without exposing internal event concepts', async () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <ProjectShowcase />
        </MemoryRouter>
      </MantineProvider>
    )

    expect(await screen.findByText('Customer Portal Renewal')).toBeInTheDocument()
    expect(screen.queryByText('Under Construction')).not.toBeInTheDocument()
    expect(screen.queryByText(/This page is currently under development/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New nomination' })).not.toBeInTheDocument()
    expect(screen.queryByText(/votes available/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Customer Values').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Innovation Breakthrough').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Collaboration to Win').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /All nominees\s*1/ })).toBeInTheDocument()
    expect(screen.queryByText('Spring 2026 Hackathon')).not.toBeInTheDocument()
    expect(screen.queryByText('Winners Only')).not.toBeInTheDocument()
  })

  it('shows nomination details without loading or offering comments', async () => {
    const user = userEvent.setup()
    render(
      <MantineProvider>
        <MemoryRouter>
          <ProjectShowcase />
        </MemoryRouter>
      </MantineProvider>
    )

    await screen.findByText('Customer Portal Renewal')
    await user.click(screen.getByRole('button', { name: 'View details' }))
    expect(await screen.findByRole('heading', { name: 'Nominee' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tags' })).toBeInTheDocument()
    expect(screen.queryByText('The customer impact is well documented.')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Add a comment' })).not.toBeInTheDocument()
    expect(getComments).not.toHaveBeenCalled()
  })

  it('requires a track choice before revealing the nomination form', async () => {
    const user = userEvent.setup()
    render(
      <MantineProvider env="test">
        <MemoryRouter>
          <ProjectShowcase nominationMode />
        </MemoryRouter>
      </MantineProvider>
    )

    expect(await screen.findByText('Choose a track to begin')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Award Category/ })).not.toBeInTheDocument()

    const valueTrack = screen.getByRole('radio', { name: /Customer Values/ })
    expect(valueTrack).toHaveAttribute('aria-checked', 'false')
    await user.click(valueTrack)

    expect(valueTrack).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByRole('textbox', { name: /Award Category/ })).toHaveValue('Customer Values')
    expect(screen.queryByRole('textbox', { name: /Contribution title/ })).not.toBeInTheDocument()
    expect(document.getElementById('nomination-track-description')).toHaveTextContent('Deliver end-to-end solutions and create tangible values for customers/users.')
    await user.type(screen.getByRole('textbox', { name: /Executive Summary/ }), 'Keep this contribution when switching categories.')
    await user.click(screen.getByRole('textbox', { name: 'Award Category' }))
    await user.click(await screen.findByRole('option', { name: 'Collaboration to Win' }))
    expect(screen.getByRole('radio', { name: /Collaboration to Win/ })).toHaveAttribute('aria-checked', 'true')
    expect(document.getElementById('nomination-track-description')).toHaveTextContent('Took ownership of shared goals, proactively support upstream and downstream tasks while completing their own work.')
    expect(screen.getByRole('textbox', { name: /Executive Summary/ })).toHaveValue('Keep this contribution when switching categories.')
  })

  const renderVoting = (path = '/projects') => render(<MantineProvider env="test"><MemoryRouter initialEntries={[path]}><ProjectShowcase /></MemoryRouter></MantineProvider>)
  const openCartWithSelection = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Vote, 2 votes' }))
    await userEvent.click(screen.getByRole('button', { name: 'My votes (1)' }))
    return screen.getByRole('dialog', { name: 'My votes (1)' })
  }
  const mockSubmitted = async () => {
    const page = await getIdeas.getMockImplementation()!()
    getIdeas.mockResolvedValueOnce({ ...page, content: page.content.map((idea) => ({ ...idea, userHasVoted: true, votes: 3 })) })
  }

  it('keeps selections in the cart without writing votes until Submit', async () => {
    renderVoting()
    const cart = await openCartWithSelection()
    expect(within(cart).getByText('Customer Portal Renewal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'In cart, 2 votes' })).toBeInTheDocument()
    expect(voteIdea).not.toHaveBeenCalled()
    expect(submitVotes).not.toHaveBeenCalled()
    await mockSubmitted()
    await userEvent.click(within(cart).getByRole('button', { name: 'Submit' }))
    const records = await screen.findByRole('dialog', { name: 'My voting records' }, { timeout: 2500 })
    expect(await within(records).findByText('Customer Portal Renewal')).toBeInTheDocument()
    expect(submitVotes).toHaveBeenCalledExactlyOnceWith(['idea-1'])
    expect(within(records).getByRole('status')).toHaveTextContent('saved to the database')
    await userEvent.click(within(records).getByRole('button', { name: 'Back to nominees' }))
    await userEvent.click(await screen.findByRole('button', { name: 'My votes (0)' }))
    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    expect(localStorage.getItem('award-voting-cart-v1:user-1')).toBe('[]')
  })

  it('loads submitted records through the account link with an empty cart', async () => {
    await mockSubmitted()
    renderVoting('/projects?view=voting-records')
    const records = await screen.findByRole('dialog', { name: 'My voting records' }, { timeout: 2500 })
    expect(await within(records).findByText('Customer Portal Renewal')).toBeInTheDocument()
    await userEvent.click(within(records).getByRole('button', { name: 'Back to nominees' }))
    expect(await screen.findByRole('button', { name: 'My votes (0)' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Submitted, 3 votes' }))
    expect(await screen.findByRole('dialog', { name: 'My voting records' }, { timeout: 2500 })).toBeInTheDocument()
    expect(voteIdea).not.toHaveBeenCalled()
  })

  it.each(['Each participant can cast at most 4 votes per award category.', 'At most 2 votes may be cast for projects from your department.', 'Unable to connect. Please try again.'])('retains the entire cart when submission fails: %s', async (message) => {
    renderVoting()
    const cart = await openCartWithSelection()
    submitVotes.mockRejectedValueOnce(new Error(message))
    await userEvent.click(within(cart).getByRole('button', { name: 'Submit' }))
    const failure = await screen.findByRole('dialog', { name: 'Votes not submitted' })
    expect(within(failure).getByRole('alert')).toHaveTextContent(message)
    await userEvent.click(within(failure).getByRole('button', { name: 'Back to cart' }))
    await waitFor(() => expect(failure).not.toBeInTheDocument())
    expect(within(cart).getByText('Customer Portal Renewal')).toBeInTheDocument()
    expect(within(cart).getByRole('button', { name: 'Submit' })).toBeEnabled()
    expect(screen.queryByRole('dialog', { name: 'My voting records' })).not.toBeInTheDocument()
    await mockSubmitted()
    await userEvent.click(within(cart).getByRole('button', { name: 'Submit' }))
    expect(await screen.findByRole('dialog', { name: 'My voting records' }, { timeout: 2500 })).toBeInTheDocument()
  })

  it('prevents repeat submission and cart edits while awaiting the server', async () => {
    let resolve!: () => void
    submitVotes.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
    renderVoting()
    const cart = await openCartWithSelection()
    const submit = within(cart).getByRole('button', { name: 'Submit' })
    await userEvent.dblClick(submit)
    expect(submitVotes).toHaveBeenCalledTimes(1)
    expect(within(cart).getByRole('button', { name: 'Clear all', hidden: true })).toBeDisabled()
    const progress = screen.getByRole('dialog', { name: 'Submit votes' })
    expect(within(progress).getByRole('status')).toHaveTextContent('Submitting your votes')
    expect(document.querySelector('.dp-submit-animation')).toHaveAttribute('data-state', 'submitting')
    await mockSubmitted()
    resolve()
    expect(await within(progress).findByRole('status')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.dp-submit-animation')).toHaveAttribute('data-state', 'success'))
    expect(await screen.findByRole('dialog', { name: 'My voting records' }, { timeout: 2500 })).toBeInTheDocument()
  })

  it('preserves drafts on remount and keeps account carts separate', async () => {
    const page = renderVoting()
    await openCartWithSelection()
    page.unmount()
    const remounted = renderVoting()
    expect(await screen.findByRole('button', { name: 'My votes (1)' })).toBeInTheDocument()
    remounted.unmount()
    const previous = currentUser.id
    currentUser.id = 'another-user'
    renderVoting()
    expect(await screen.findByRole('button', { name: 'My votes (0)' })).toBeInTheDocument()
    currentUser.id = previous
  })

  it.each(['Clear all', 'Clear Spring 2026 Hackathon Innovation Breakthrough votes', 'Remove Customer Portal Renewal from cart'])('clears drafts without deleting submitted database records: %s', async (button) => {
    renderVoting()
    const cart = await openCartWithSelection()
    await userEvent.click(within(cart).getByRole('button', { name: button }))
    expect(await within(cart).findByText('Your cart is empty.')).toBeInTheDocument()
    expect(clearMyVotes).not.toHaveBeenCalled()
    expect(clearTrackVotes).not.toHaveBeenCalled()
    expect(deleteVoteRecord).not.toHaveBeenCalled()
  })

  it('requires irreversible deletion confirmation, supports cancel and retry, and allows a new selection', async () => {
    await mockSubmitted()
    renderVoting('/projects?view=voting-records')
    const records = await screen.findByRole('dialog', { name: 'My voting records' }, { timeout: 2500 })
    const remove = await within(records).findByRole('button', { name: 'Delete voting record for Customer Portal Renewal' })
    await userEvent.click(remove)
    let confirmation = await screen.findByRole('dialog', { name: 'Delete voting record?' })
    expect(within(confirmation).getByText(/This action cannot be undone/)).toBeInTheDocument()
    expect(deleteVoteRecord).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(confirmation).not.toBeInTheDocument())
    expect(within(records).getByText('Customer Portal Renewal')).toBeInTheDocument()
    await userEvent.click(remove)
    confirmation = await screen.findByRole('dialog', { name: 'Delete voting record?' })
    deleteVoteRecord.mockRejectedValueOnce(new Error('Please try again.'))
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete permanently' }))
    expect(await within(confirmation).findByRole('alert')).toHaveTextContent('Please try again.')
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete permanently' }))
    expect(deleteVoteRecord).toHaveBeenLastCalledWith('idea-1')
    expect(await within(records).findByText('No submitted votes yet.')).toBeInTheDocument()
    await userEvent.click(within(records).getByRole('button', { name: 'Back to nominees' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Vote, 2 votes' }))
    expect(screen.getByRole('button', { name: 'My votes (1)' })).toBeInTheDocument()
  })

  it('splits legacy combined tags into separate, deduplicated badges', async () => {
    getIdeas.mockResolvedValueOnce({ content: [{
      id: 'idea-1', title: 'Legacy tags', description: 'Combined tags', teamId: 'team-1',
      createdBy: 'user-1', category: 'AI', tags: ['IoT、Digital Twin，Cloud、IoT、'],
      attachments: [], projectAttachments: [], votes: 0, userHasVoted: false,
      status: 'submitted', createdAt: '', updatedAt: '',
    }] })
    render(<MantineProvider env="test"><MemoryRouter><ProjectShowcase /></MemoryRouter></MantineProvider>)
    await screen.findByText('Legacy tags')
    const tags = document.querySelector('.dp-nomination-tags') as HTMLElement
    expect(within(tags).getByText('IoT')).toBeInTheDocument()
    expect(within(tags).getByText('Digital Twin')).toBeInTheDocument()
    expect(within(tags).getByText('Cloud')).toBeInTheDocument()
    expect(within(tags).getAllByText('IoT')).toHaveLength(1)
  })

  it('previews only the summary and keeps all answers in the detail dialog', async () => {
    getIdeas.mockResolvedValueOnce({ content: [{
      id: 'idea-1', title: 'Nominee Name', teamId: 'team-1', createdBy: 'user-1',
      description: 'Executive Summary\nSummary first paragraph.\n\nSummary second paragraph.\n\nDetails of Your Core Achievement in 2026 and Business Impact (including financial figures)\nSaved RMB 200,000.\n\nHow You Demonstrate Bosch China Culture (Especially in Your Applied Category)\nWorked across departments.',
      category: 'AI', tags: ['Impact'], attachments: [], projectAttachments: [],
      votes: 0, userHasVoted: false, status: 'submitted', createdAt: '', updatedAt: '',
    }] })
    render(<MantineProvider env="test"><MemoryRouter><ProjectShowcase /></MemoryRouter></MantineProvider>)
    await screen.findByText('Nominee Name')
    const card = document.querySelector('.dp-project-card') as HTMLElement
    expect(within(card).getByText(/Summary first paragraph/)).toHaveTextContent('Summary second paragraph.')
    expect(within(card).queryByText(/Saved RMB/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/Worked across departments/)).not.toBeInTheDocument()
    expect(within(card).queryByText('Department')).not.toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'View details' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('heading', { name: 'Executive Summary (The Elevator Pitch)' })).toBeInTheDocument()
    expect(dialog.getByRole('heading', { name: /Details of Your Core Achievement/ })).toBeInTheDocument()
    expect(dialog.getByRole('heading', { name: /How you demonstrate BD China culture/ })).toBeInTheDocument()
    for (const answer of ['Summary first paragraph.', 'Summary second paragraph.', 'Saved RMB 200,000.', 'Worked across departments.']) {
      expect(dialog.getByText(answer)).toBeInTheDocument()
    }
  })

  it('presents nomination as an individual three-track flow without team controls', async () => {
    const user = userEvent.setup()
    render(
      <MantineProvider>
        <MemoryRouter>
          <ProjectShowcase nominationMode />
        </MemoryRouter>
      </MantineProvider>
    )

    expect(await screen.findByRole('heading', { name: 'Choose an award category' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Nominate a Digital Pioneer/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Executive Summary/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Innovation Breakthrough/ }))
    expect(screen.getByRole('textbox', { name: /Executive Summary \(The Elevator Pitch\)/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Details of Your Core Achievement in 2026 and Business Impact/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /How you demonstrate BD China culture/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Tags you want to add/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Award Category/ })).toHaveValue('Innovation Breakthrough')
    expect(screen.getByRole('button', { name: 'Submit nomination' })).toBeDisabled()
    expect(screen.queryByText('Team')).not.toBeInTheDocument()
    expect(screen.queryByText('Customer Portal Renewal')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Award event' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Position/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Nominating HoD/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Supporting evidence URL/ })).not.toBeInTheDocument()
  })

  it('lets an administrator choose the actual associate for manager nomination', async () => {
    currentUser.role = 'admin'
    try {
      const user = userEvent.setup()
      render(<MantineProvider env="test"><MemoryRouter><ProjectShowcase nominationMode /></MemoryRouter></MantineProvider>)
      await user.click(await screen.findByRole('radio', { name: /Customer Values/ }))
      const nominee = await screen.findByRole('textbox', { name: /Outlook Name/ })
      await user.clear(nominee)
      await user.type(nominee, 'Named')
      await user.click(await screen.findByRole('option', { name: 'Named Associate (associate@example.com)' }))
      expect(nominee).toHaveValue('Named Associate (associate@example.com)')
      expect(screen.getByRole('textbox', { name: /Award Category/ })).toHaveValue('Customer Values')
    } finally {
      currentUser.role = 'participant'
    }
  })

  it('submits an individual nomination in a draft award without creating a team' , async () => {
    currentUser.role = 'admin'
    getHackathons.mockResolvedValueOnce({ content: [{ id: 'hackathon-1', title: '2026 Award', status: 'draft' }] })
    const user = userEvent.setup()
    render(
      <MantineProvider>
        <MemoryRouter>
          <ProjectShowcase nominationMode />
        </MemoryRouter>
      </MantineProvider>
    )

    await user.click(await screen.findByRole('radio', { name: /Customer Values/ }))
    await user.type(screen.getByRole('textbox', { name: /Executive Summary/ }), 'A better customer experience in four clear sentences.')
    await user.type(screen.getByRole('textbox', { name: /Details of Your Core Achievement in 2026 and Business Impact/ }), 'Reduced service time by 30% and saved RMB 200,000.')
    await user.type(screen.getByRole('textbox', { name: /How you demonstrate BD China culture/ }), 'Listened to users and delivered an end-to-end solution.')
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    const oversized = new File(['image'], 'large.png', { type: 'image/png' })
    Object.defineProperty(oversized, 'size', { value: 50 * 1024 * 1024 + 1 })
    await user.upload(fileInput!, oversized)
    expect(screen.getByText('Photo exceeds 50 MB. Please choose a smaller photo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit nomination' })).toBeDisabled()
    expect(uploadFile).not.toHaveBeenCalled()
    await user.upload(fileInput!, new File(['image'], 'project.png', { type: 'image/png' }))
    expect(screen.queryByText('Photo exceeds 50 MB. Please choose a smaller photo.')).not.toBeInTheDocument()
    const tagsInput = screen.getByRole('textbox', { name: /Tags you want to add/ })
    await user.type(tagsInput, 'Customer、Innovation，Collaboration, Impact、Digital、Sixth、')
    expect(screen.getByRole('button', { name: 'Submit nomination' })).toBeDisabled()
    expect(createIdea).not.toHaveBeenCalled()
    await user.clear(tagsInput)
    await user.type(tagsInput, 'Customer，Innovation、Collaboration, Impact、Digital、Customer、')
    expect(screen.getByRole('button', { name: 'Submit nomination' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Submit nomination' }))

    await waitFor(() => expect(createIdea).toHaveBeenCalled())
    expect(getOrCreateNominationTeam).not.toHaveBeenCalled()
    expect(createTeam).not.toHaveBeenCalled()
    expect(createIdea.mock.calls[0][0]).not.toHaveProperty('teamId')
    expect(uploadFile).toHaveBeenCalledWith(expect.any(File), 'project-attachments', 'nominations/hackathon-1/user-1')
    expect(createIdea).toHaveBeenCalledWith(expect.objectContaining({
      hackathonId: 'hackathon-1',
      category: 'Customer Values',
      tags: ['Customer', 'Innovation', 'Collaboration', 'Impact', 'Digital'],
      title: 'User',
    }))
    expect(createIdea).toHaveBeenCalledWith(expect.objectContaining({
      status: 'submitted',
      projectAttachments: expect.arrayContaining([expect.objectContaining({ type: 'nomination', nomineeUserId: 'user-1', name: 'User' })]),
    }))
    expect(createIdea).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining('Details of Your Core Achievement in 2026 and Business Impact (including financial figures)'),
    }))
    expect(createIdea).toHaveBeenCalledTimes(1)
    expect(updateIdea).not.toHaveBeenCalled()
    expect(uploadFile.mock.invocationCallOrder[0]).toBeLessThan(createIdea.mock.invocationCallOrder[0])
  })
})


describe('Nominee deletion', () => {
  afterEach(() => { currentUser.role = 'participant'; vi.clearAllMocks() })

  function renderManagement() {
    return render(<MantineProvider><MemoryRouter><ProjectShowcase managementMode /></MemoryRouter></MantineProvider>)
  }

  it.each(['participant', 'manager'] as const)('does not expose deletion to %s', async (role) => {
    currentUser.role = role
    renderManagement()
    await screen.findByText('Customer Portal Renewal')
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('requires confirmation, allows cancellation, then removes a committed deletion and updates counts', async () => {
    currentUser.role = 'admin'
    renderManagement()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Customer Portal Renewal' }))
    let dialog = await screen.findByRole('dialog', { name: 'Confirm nomination deletion' })
    expect(deleteIdea).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Customer Portal Renewal')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Customer Portal Renewal' }))
    dialog = await screen.findByRole('dialog', { name: 'Confirm nomination deletion' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(screen.queryByText('Customer Portal Renewal')).not.toBeInTheDocument())
    expect(deleteIdea).toHaveBeenCalledExactlyOnceWith('idea-1')
    expect(screen.getByRole('button', { name: /All nominees\s*0/ })).toBeInTheDocument()
  })

  it.each(['selected', 'all'])('deletes %s nominations in one batch after confirmation', async (mode) => {
    currentUser.role = 'admin'
    const original = await getIdeas()
    getIdeas.mockResolvedValueOnce({ content: [original.content[0], { ...original.content[0], id: 'idea-2', title: 'Second nomination' }] })
    renderManagement()
    await screen.findByText('Second nomination')
    if (mode === 'selected') await userEvent.click(screen.getByRole('checkbox', { name: 'Select all results (2)' }))
    await userEvent.click(screen.getByRole('button', { name: mode === 'selected' ? 'Delete selected (2)' : 'Delete all (2)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirm nomination deletion' })
    expect(deleteIdeas).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(screen.queryByText('Second nomination')).not.toBeInTheDocument())
    expect(deleteIdeas).toHaveBeenCalledExactlyOnceWith(['idea-1', 'idea-2'])
    expect(screen.getByRole('button', { name: 'Delete all (0)' })).toBeDisabled()
  })

  it('preserves nominations and selection on failure and allows retry', async () => {
    currentUser.role = 'admin'
    deleteIdea.mockRejectedValueOnce(new Error('Deletion failed'))
    renderManagement()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Customer Portal Renewal' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirm nomination deletion' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deletion failed')
    expect(screen.getByRole('checkbox', { name: 'Select Customer Portal Renewal' })).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(screen.queryByText('Customer Portal Renewal')).not.toBeInTheDocument())
    expect(deleteIdea).toHaveBeenCalledTimes(2)
  })
})
