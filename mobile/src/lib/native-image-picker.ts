export async function pickNativeImage():Promise<FormData|null>{
 const picker=await import('expo-document-picker');const result=await picker.getDocumentAsync({type:['image/jpeg','image/png','image/webp'],multiple:false,copyToCacheDirectory:true});if(result.canceled)return null
 const file=result.assets[0];if(!file?.mimeType||!['image/jpeg','image/png','image/webp'].includes(file.mimeType)||file.size===undefined||file.size<1||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG or WebP image up to 5 MB.')
 const form=new FormData();form.append('file',{uri:file.uri,name:file.name,type:file.mimeType} as unknown as Blob);return form
}
