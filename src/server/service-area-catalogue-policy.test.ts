import {test,expect} from 'bun:test'
import {parseServiceArea,parseAreaConsent} from './service-area-catalogue-policy'
test('reviewed synthetic community centroid rounded, personal position fields rejected',()=>{
 const input={name:'Synthetic community',region:'Volta',latitude:6.123456,longitude:0.123456,attested:true}
 expect(parseServiceArea(input)).toEqual({country:'GH',name:'Synthetic community',region:'Volta',latitude:6.12,longitude:.12})
 for(const patch of [{attested:false},{latitude:NaN},{longitude:20},{region:'Unknown'},{ownerId:'other'},{address:'private'}])expect(()=>parseServiceArea({...input,...patch})).toThrow()
})
test('consent is explicit and limited to catalogue area ID',()=>{
 expect(parseAreaConsent({areaId:'a1',consent:true})).toEqual({areaId:'a1'})
 for(const raw of [{areaId:'a1',consent:false},{areaId:'a1',consent:true,latitude:5},{areaId:'a1',consent:true,ownerId:'other'}])expect(()=>parseAreaConsent(raw)).toThrow()
})
