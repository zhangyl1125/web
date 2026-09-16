import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const english = {
  'header.account': 'Account',
  'header.profile': 'Profile',
  'header.settings': 'Settings',
  'header.logout': 'Logout',
  'sidebar.navigation': 'Navigation',
  'sidebar.overview': 'Overview',
  'sidebar.overviewDescription': 'Award introduction and timeline',
  'sidebar.nomination': 'Nomination',
  'sidebar.nominationDescription': 'Submit an individual nomination',
  'sidebar.projectOverview': 'Browse & Vote',
  'sidebar.projectOverviewDescription': 'Review nominees and cast your vote',
  'sidebar.dashboard': 'Dashboard',
  'sidebar.dashboardDescription': 'Overview and analytics',
  'sidebar.organizations': 'Organizations',
  'sidebar.organizationsDescription': 'Your org memberships',
  'sidebar.hackathons': 'Hackathons',
  'sidebar.hackathonsDescription': 'Browse and manage events',
  'sidebar.teams': 'Teams',
  'sidebar.teamsDescription': 'Join or create teams',
  'sidebar.projects': 'Projects',
  'sidebar.projectsDescription': 'Showcase and discover projects',
  'sidebar.profile': 'Profile',
  'sidebar.profileDescription': 'Manage your account',
  'sidebar.adminPanel': 'Admin Panel',
  'sidebar.management': 'Management',
  'sidebar.createHackathon': 'Create Hackathon',
  'sidebar.createHackathonDescription': 'Start a new event',
  'sidebar.manageUsers': 'Manage Users',
  'sidebar.manageMembers': 'Manage Members',
  'sidebar.manageUsersDescription': 'Create and manage user accounts',
  'sidebar.manageMembersDescription': 'View and manage org members',
  'sidebar.manageOrganizations': 'Manage Organizations',
  'sidebar.manageOrganizationsDescription': 'View and manage all organizations',
  'sidebar.welcome': 'Welcome, {{name}}',
  'dashboard.welcomeBack': 'Welcome back!',
  'dashboard.welcomeBackWithName': 'Welcome back, {{name}}!',
  'dashboard.communitySummary': "Here's what's happening in your hackathon community",
  'dashboard.discoverSummary': 'Discover amazing hackathons and join the community',
  'dashboard.administrator': 'Administrator',
  'dashboard.manager': 'Hackathon Manager',
  'dashboard.participant': 'Participant',
  'dashboard.unknownRole': 'Unknown',
  'dashboard.allAccess': 'All Access',
  'dashboard.eventOrganizer': 'Event Organizer',
  'dashboard.recentNotifications': 'Recent Notifications',
  'dashboard.markAllAsRead': 'Mark all as read',
  'dashboard.activeHackathons': 'Active Hackathons',
  'dashboard.currentlyRunning': 'Currently running',
  'dashboard.totalHackathons': 'Total Hackathons',
  'dashboard.allTime': 'All time',
  'dashboard.myTeams': 'My Teams',
  'dashboard.totalTeams': 'Total Teams',
  'dashboard.teamsImIn': "Teams I'm in",
  'dashboard.acrossAllHackathons': 'Across all hackathons',
  'dashboard.myIdeas': 'My Ideas',
  'dashboard.totalIdeas': 'Total Ideas',
  'dashboard.ideasSubmitted': "Ideas I've submitted",
  'dashboard.viewAll': 'View all',
  'dashboard.participants': '{{count}} participants',
  'dashboard.ends': 'Ends {{date}}',
  'dashboard.viewDetails': 'View Details',
  'dashboard.noActiveHackathons': 'No active hackathons at the moment',
  'dashboard.quickActions': 'Quick Actions',
  'dashboard.createHackathon': 'Create Hackathon',
  'dashboard.browseTeams': 'Browse Teams',
  'dashboard.exploreIdeas': 'Explore Ideas',
  'dashboard.viewProjects': 'View Projects',
  'dashboard.topIdeas': 'Top Ideas',
  'dashboard.votes': '{{count}} votes',
  'dashboard.noIdeas': 'No ideas yet',
  'status.active': 'Active',
  'status.running': 'Running',
  'status.open': 'Open',
  'status.upcoming': 'Upcoming',
  'status.completed': 'Completed',
} as const

type TranslationKey = keyof typeof english
type Language = 'zh' | 'en'
type Replacements = Record<string, string | number>

const chinese: Record<TranslationKey, string> = {
  'header.account': '账户',
  'header.profile': '个人资料',
  'header.settings': '设置',
  'header.logout': '退出登录',
  'sidebar.navigation': '导航',
  'sidebar.overview': '概览',
  'sidebar.overviewDescription': '奖项介绍与时间安排',
  'sidebar.nomination': '个人报名',
  'sidebar.nominationDescription': '提交个人报名',
  'sidebar.projectOverview': '浏览与投票',
  'sidebar.projectOverviewDescription': '查看候选案例并投票',
  'sidebar.dashboard': '仪表盘',
  'sidebar.dashboardDescription': '概览与数据分析',
  'sidebar.organizations': '组织',
  'sidebar.organizationsDescription': '我的组织成员关系',
  'sidebar.hackathons': '黑客松',
  'sidebar.hackathonsDescription': '浏览和管理活动',
  'sidebar.teams': '团队',
  'sidebar.teamsDescription': '加入或创建团队',
  'sidebar.projects': '项目',
  'sidebar.projectsDescription': '展示和发现项目',
  'sidebar.profile': '个人资料',
  'sidebar.profileDescription': '管理我的账户',
  'sidebar.adminPanel': '管理面板',
  'sidebar.management': '活动管理',
  'sidebar.createHackathon': '创建黑客松',
  'sidebar.createHackathonDescription': '发起新活动',
  'sidebar.manageUsers': '用户管理',
  'sidebar.manageMembers': '成员管理',
  'sidebar.manageUsersDescription': '创建和管理用户账户',
  'sidebar.manageMembersDescription': '查看和管理组织成员',
  'sidebar.manageOrganizations': '组织管理',
  'sidebar.manageOrganizationsDescription': '查看和管理所有组织',
  'sidebar.welcome': '欢迎，{{name}}',
  'dashboard.welcomeBack': '欢迎回来！',
  'dashboard.welcomeBackWithName': '欢迎回来，{{name}}！',
  'dashboard.communitySummary': '这是您的黑客松社区最新动态',
  'dashboard.discoverSummary': '发现精彩黑客松，加入社区',
  'dashboard.administrator': '管理员',
  'dashboard.manager': '黑客松管理员',
  'dashboard.participant': '参与者',
  'dashboard.unknownRole': '未知',
  'dashboard.allAccess': '全部权限',
  'dashboard.eventOrganizer': '活动组织者',
  'dashboard.recentNotifications': '最近通知',
  'dashboard.markAllAsRead': '全部标为已读',
  'dashboard.activeHackathons': '进行中的黑客松',
  'dashboard.currentlyRunning': '当前正在进行',
  'dashboard.totalHackathons': '黑客松总数',
  'dashboard.allTime': '全部时间',
  'dashboard.myTeams': '我的团队',
  'dashboard.totalTeams': '团队总数',
  'dashboard.teamsImIn': '我加入的团队',
  'dashboard.acrossAllHackathons': '所有黑客松',
  'dashboard.myIdeas': '我的创意',
  'dashboard.totalIdeas': '创意总数',
  'dashboard.ideasSubmitted': '我提交的创意',
  'dashboard.viewAll': '查看全部',
  'dashboard.participants': '{{count}} 位参与者',
  'dashboard.ends': '{{date}} 结束',
  'dashboard.viewDetails': '查看详情',
  'dashboard.noActiveHackathons': '目前没有进行中的黑客松',
  'dashboard.quickActions': '快捷操作',
  'dashboard.createHackathon': '创建黑客松',
  'dashboard.browseTeams': '浏览团队',
  'dashboard.exploreIdeas': '探索创意',
  'dashboard.viewProjects': '查看项目',
  'dashboard.topIdeas': '热门创意',
  'dashboard.votes': '{{count}} 票',
  'dashboard.noIdeas': '暂无创意',
  'status.active': '进行中',
  'status.running': '进行中',
  'status.open': '开放中',
  'status.upcoming': '即将开始',
  'status.completed': '已结束',
}

const translations = { zh: chinese, en: english }

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  t: (key: TranslationKey, replacements?: Replacements) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  t: (key, replacements) => interpolate(english[key], replacements),
})

function interpolate(value: string, replacements?: Replacements) {
  if (!replacements) return value
  return Object.entries(replacements).reduce(
    (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, String(replacement)),
    value,
  )
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // The site is fixed to English; React owns the copy, without DOM translation passes.
  const [language, updateLanguage] = useState<Language>('en')
  const setLanguage = useCallback(() => updateLanguage('en'), [])

  useEffect(() => {
    localStorage.setItem('hackhub-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  const toggleLanguage = useCallback(() => {
    updateLanguage('en')
  }, [])

  const t = useCallback((key: TranslationKey, replacements?: Replacements) => {
    return interpolate(translations[language][key], replacements)
  }, [language])

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// Provider and hook intentionally share this small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  return useContext(LanguageContext)
}
