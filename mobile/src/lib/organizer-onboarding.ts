/** Native organizer onboarding mirrors the server's six organizer types.
 * A created profile is UNVERIFIED until backend KYC approval. */
export const ORGANIZER_CATEGORIES = [
  {value:'INDIVIDUAL',label:'Personal organizer',description:'Host celebrations, workshops and your own events'},
  {value:'CHURCH',label:'Church',description:'Worship, crusades and conferences'},
  {value:'SCHOOL',label:'School',description:'Graduations, educational events and reunions'},
  {value:'COMPANY',label:'Business',description:'Corporate events, launches and concerts'},
  {value:'MINISTRY',label:'Ministry',description:'Outreach and faith programmes'},
  {value:'ASSOCIATION',label:'Association',description:'Clubs, NGOs and community groups'},
] as const
export type OrganizerCategory=typeof ORGANIZER_CATEGORIES[number]['value']
export type ProfileField={key:string;label:string;placeholder:string}
export const ORGANIZER_PROFILE_FIELDS:Record<OrganizerCategory,readonly ProfileField[]>={
  INDIVIDUAL:[{key:'publicRole',label:'Your public role',placeholder:'Event host, speaker or planner'},
              {key:'eventFocus',label:'Types of events',placeholder:'Weddings, workshops, birthdays'}],
  CHURCH:[{key:'denomination',label:'Denomination',placeholder:'Church affiliation'},
          {key:'branchName',label:'Branch',placeholder:'Main branch or assembly'},
          {key:'leadPastor',label:'Head pastor',placeholder:'Public leader name'}],
  SCHOOL:[{key:'schoolLevel',label:'School level',placeholder:'KG, Primary, JHS, SHS, Tertiary'},
          {key:'campusName',label:'Campus or branch',placeholder:'Main campus'},
          {key:'schoolHead',label:'School head',placeholder:'Principal or headteacher'}],
  COMPANY:[{key:'industry',label:'Industry',placeholder:'Technology, entertainment, hospitality'},
           {key:'contactPerson',label:'Contact person',placeholder:'Public representative'}],
  MINISTRY:[{key:'ministryFocus',label:'Ministry focus',placeholder:'Music, youth, outreach'},
            {key:'ministryLeader',label:'Ministry leader',placeholder:'Public ministry leader'}],
  ASSOCIATION:[{key:'associationFocus',label:'Association focus',placeholder:'Community, charity, alumni'},
               {key:'associationChair',label:'Chairperson',placeholder:'Public coordinator'}],
}
export type OrganizerOnboardingForm={
  orgType:OrganizerCategory|null;name:string;tagline:string;description:string
  country:string;city:string;contactEmail:string;contactPhone:string;website:string
  profileDetails:Record<string,string>
}
export const EMPTY_ORGANIZER_FORM:OrganizerOnboardingForm={
  orgType:null,name:'',tagline:'',description:'',country:'GH',city:'',contactEmail:'',contactPhone:'',website:'',profileDetails:{},
}
export function validateOrganizerOnboarding(form:OrganizerOnboardingForm):string|null{
  if(!form.orgType||!ORGANIZER_CATEGORIES.some(x=>x.value===form.orgType))return 'Select the type of organizer you are creating.'
  if(form.name.trim().length<3||form.name.trim().length>120)return 'Enter an organizer name between 3 and 120 characters.'
  if(form.tagline.length>160)return 'The public tagline must be 160 characters or fewer.'
  if(form.description.length>2000)return 'The description must be 2,000 characters or fewer.'
  if(!/^[a-z]{2}$/i.test(form.country.trim()))return 'Enter the two-letter country code (for example GH).'
  if(form.city.length>60)return 'City must be 60 characters or fewer.'
  if(form.contactPhone.length>24)return 'Contact phone must be 24 characters or fewer.'
  if(form.contactEmail.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim()))return 'Enter a valid public contact email or leave it empty.'
  if(form.contactEmail.length>160)return 'Contact email is too long.'
  if(form.website.trim()&&!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(form.website.trim()))return 'Enter an HTTPS website URL or leave it empty.'
  return null
}
export function organizerOnboardingPayload(form:OrganizerOnboardingForm){
  if(!form.orgType)throw Error('Choose an organizer type')
  const fields=new Set(ORGANIZER_PROFILE_FIELDS[form.orgType].map(x=>x.key))
  const profileDetails=Object.fromEntries(Object.entries(form.profileDetails)
    .filter(([k,v])=>fields.has(k)&&Boolean(v.trim()))
    .map(([k,v])=>[k,v.trim().slice(0,240)]))
  return {orgType:form.orgType,name:form.name.trim(),tagline:form.tagline.trim(),description:form.description.trim(),
    country:form.country.trim().toUpperCase(),city:form.city.trim(),
    contactEmail:form.contactEmail.trim(),contactPhone:form.contactPhone.trim(),website:form.website.trim(),profileDetails}
}
