import {expect,test} from 'bun:test'
import {parseDirectReport} from './direct-report-policy'
test('reports require a supported reason and bounded optional details',()=>{
 expect(parseDirectReport({reason:'SPAM',details:'  repeated  '})).toEqual({reason:'SPAM',details:'repeated'})
 expect(parseDirectReport({reason:'FRAUD'})).toEqual({reason:'FRAUD',details:null})
 expect(parseDirectReport({reason:'OTHER',details:'a'.repeat(1001)})).toBeNull()
 expect(parseDirectReport({reason:'INVALID'})).toBeNull()
})
