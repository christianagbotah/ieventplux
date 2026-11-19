/** Public labels and requirement checks over private KYC *metadata only*.
 * Never pass the encrypted file contents to this helper.
 */
export type IdentityDocumentKind = 'BUSINESS_REGISTRATION' | 'GOVERNMENT_ID' | 'SELFIE'
export type IdentityDocumentSide = 'FRONT' | 'BACK'
export type IdentityEvidence = { kind: IdentityDocumentKind; side?: IdentityDocumentSide | null }

export const KYC_DOCUMENT_LABELS: Record<IdentityDocumentKind, string> = {
  BUSINESS_REGISTRATION: 'Business / organization registration',
  GOVERNMENT_ID: 'Government-issued identity document',
  SELFIE: 'Live selfie photo (manual review)',
}

export type KycRequirementKey = 'ID_FRONT' | 'ID_BACK' | 'SELFIE' | 'REGISTRATION'
export type KycRequirement = { key: KycRequirementKey; label: string; complete: boolean }

/** An ID uploaded before front/back support is treated as a front-side image.
 * The existing encrypted document remains valid and downloadable; users must
 * add its reverse side and a selfie for newly required review evidence.
 */
export function kycRequirements(orgType: string, documents: readonly IdentityEvidence[]): KycRequirement[] {
  const id = documents.filter((doc) => doc.kind === 'GOVERNMENT_ID')
  const requirements: KycRequirement[] = [
    { key: 'ID_FRONT', label: 'Government ID – front', complete: id.some((doc) => !doc.side || doc.side === 'FRONT') },
    { key: 'ID_BACK', label: 'Government ID – back', complete: id.some((doc) => doc.side === 'BACK') },
    { key: 'SELFIE', label: 'Identity selfie', complete: documents.some((doc) => doc.kind === 'SELFIE') },
  ]
  if (orgType === 'COMPANY' || orgType === 'SCHOOL') {
    requirements.push({
      key: 'REGISTRATION',
      label: orgType === 'SCHOOL' ? 'School registration / authorization document' : 'Company registration document',
      complete: documents.some((doc) => doc.kind === 'BUSINESS_REGISTRATION'),
    })
  }
  return requirements
}
export function missingKycRequirements(orgType: string, documents: readonly IdentityEvidence[]): KycRequirement[] {
  return kycRequirements(orgType, documents).filter((requirement) => !requirement.complete)
}
