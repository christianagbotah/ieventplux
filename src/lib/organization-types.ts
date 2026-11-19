/** Organizer categories are shared by onboarding, editing, KYC and the API. */
export const ORGANIZER_TYPES = ['CHURCH', 'SCHOOL', 'COMPANY', 'INDIVIDUAL', 'MINISTRY', 'ASSOCIATION'] as const
export type OrganizerType = typeof ORGANIZER_TYPES[number]
export type ProfileDetailKey =
  | 'denomination' | 'branchName' | 'leadPastor' | 'worshipLocation'
  | 'schoolLevel' | 'schoolType' | 'campusName' | 'schoolHead'
  | 'industry' | 'registrationNumber' | 'contactPerson'
  | 'eventFocus' | 'publicRole'
  | 'ministryFocus' | 'ministryLeader'
  | 'associationFocus' | 'associationChair'

export type ProfileDetails = Partial<Record<ProfileDetailKey, string>>
export type DetailField = { key: ProfileDetailKey; label: string; placeholder: string; hint?: string }
export type OrganizerTypeConfig = {
  label: string
  shortLabel: string
  description: string
  nameLabel: string
  namePlaceholder: string
  taglineLabel: string
  descriptionLabel: string
  detailsTitle: string
  detailsDescription: string
  fields: readonly DetailField[]
}

export const ORGANIZER_TYPE_CONFIG: Record<OrganizerType, OrganizerTypeConfig> = {
  INDIVIDUAL: {
    label: 'Personal organizer', shortLabel: 'Personal', description: 'Birthdays, weddings, workshops and events you organize yourself',
    nameLabel: 'Public organizer name', namePlaceholder: 'Your full name or public event-host name',
    taglineLabel: 'Short introduction', descriptionLabel: 'About you',
    detailsTitle: 'Your personal organizer profile', detailsDescription: 'Only your public organizer identity is shown. Your sign-in information stays private.',
    fields: [
      { key: 'publicRole', label: 'What best describes you?', placeholder: 'Event host, creator, speaker, planner…' },
      { key: 'eventFocus', label: 'Events you organize', placeholder: 'Birthdays, weddings, workshops…' },
    ],
  },
  CHURCH: {
    label: 'Church / Congregation', shortLabel: 'Church', description: 'Worship services, crusades, conferences and church activities',
    nameLabel: 'Church name', namePlaceholder: 'Official church or congregation name',
    taglineLabel: 'Church motto / tagline', descriptionLabel: 'About your church',
    detailsTitle: 'Church details', detailsDescription: 'Help attendees identify the right congregation and place of worship.',
    fields: [
      { key: 'denomination', label: 'Denomination / affiliation', placeholder: 'e.g. Pentecostal, Catholic, independent' },
      { key: 'branchName', label: 'Branch / assembly', placeholder: 'e.g. Promise Land branch' },
      { key: 'leadPastor', label: 'Head pastor / ministry leader', placeholder: 'Leader’s public name' },
      { key: 'worshipLocation', label: 'Main worship venue', placeholder: 'Auditorium, chapel or meeting venue' },
    ],
  },
  SCHOOL: {
    label: 'School / Educational institution', shortLabel: 'School', description: 'Graduations, reunions, admissions and school programmes',
    nameLabel: 'School name', namePlaceholder: 'Official school or institution name',
    taglineLabel: 'School motto / tagline', descriptionLabel: 'About your school',
    detailsTitle: 'School details', detailsDescription: 'Identify the school, campus and its educational focus.',
    fields: [
      { key: 'schoolLevel', label: 'Education level', placeholder: 'Creche, KG, Primary, JHS, SHS, Tertiary…' },
      { key: 'schoolType', label: 'School category', placeholder: 'Private, public, international, vocational…' },
      { key: 'campusName', label: 'Campus / branch', placeholder: 'Main campus or branch name' },
      { key: 'schoolHead', label: 'Headteacher / principal', placeholder: 'Public contact person’s name' },
    ],
  },
  COMPANY: {
    label: 'Business / Company', shortLabel: 'Business', description: 'Concerts, product launches, corporate events and expos',
    nameLabel: 'Company / trading name', namePlaceholder: 'Official company or business name',
    taglineLabel: 'Business tagline', descriptionLabel: 'About your business',
    detailsTitle: 'Business details', detailsDescription: 'Add information that helps people recognise your business.',
    fields: [
      { key: 'industry', label: 'Industry / business activity', placeholder: 'Event management, hospitality, technology…' },
      { key: 'registrationNumber', label: 'Business registration number (optional)', placeholder: 'As shown on registration documents', hint: 'Kept private; does not replace secure KYC document verification.' },
      { key: 'contactPerson', label: 'Public representative / manager', placeholder: 'Contact person’s name' },
    ],
  },
  MINISTRY: {
    label: 'Ministry / Outreach', shortLabel: 'Ministry', description: 'Outreach, fellowships, seminars and faith programmes',
    nameLabel: 'Ministry name', namePlaceholder: 'Official ministry name',
    taglineLabel: 'Ministry tagline', descriptionLabel: 'About the ministry',
    detailsTitle: 'Ministry details', detailsDescription: 'Introduce your ministry and its main areas of service.',
    fields: [
      { key: 'ministryFocus', label: 'Ministry focus', placeholder: 'Youth, music, missions, teaching…' },
      { key: 'ministryLeader', label: 'Ministry leader', placeholder: 'Public name of lead minister' },
    ],
  },
  ASSOCIATION: {
    label: 'Association / Community group', shortLabel: 'Association', description: 'Clubs, NGOs, professional networks and community programmes',
    nameLabel: 'Association / group name', namePlaceholder: 'Name of your group or association',
    taglineLabel: 'Association tagline', descriptionLabel: 'About the association',
    detailsTitle: 'Association details', detailsDescription: 'Help members and guests recognise your community.',
    fields: [
      { key: 'associationFocus', label: 'Association purpose', placeholder: 'Professional network, charity, alumni…' },
      { key: 'associationChair', label: 'Chairperson / coordinator', placeholder: 'Public representative’s name' },
    ],
  },
}

export function organizerType(input: unknown): OrganizerType | null {
  return typeof input === 'string' && (ORGANIZER_TYPES as readonly string[]).includes(input) ? input as OrganizerType : null
}
