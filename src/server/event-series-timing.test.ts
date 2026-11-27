import {expect,test} from 'bun:test'
import {parseRepeatWeeks,eventTimezone,eventInstant,weeklyEventOccurrences} from './event-series-timing'
test('reject malformed recurrence and invalid dates or timezones',()=>{
 for(const v of [-1,27,1.5,'NaN',true,{},'27'])expect(parseRepeatWeeks(v)).toBeNull()
 expect(parseRepeatWeeks(undefined)).toBe(0)
 expect(parseRepeatWeeks('26')).toBe(26)
 expect(eventTimezone('Invalid/Zone')).toBeNull()
 expect(eventInstant('2026-02-30T10:00:00Z')).toBeNull()
 expect(eventInstant('2026-11-27T10:00')).toBeNull()
 expect(eventInstant('2026-11-27T10:00:00+00:00')?.toISOString()).toBe('2026-11-27T10:00:00.000Z')
})
test('weekly occurrences retain local clock times across spring and autumn DST',()=>{
 const spring=weeklyEventOccurrences(new Date('2027-03-07T15:00:00Z'),new Date('2027-03-07T16:00:00Z'),'America/New_York',1)
 expect(spring?.[0]?.startsAt.toISOString()).toBe('2027-03-14T14:00:00.000Z')
 expect(spring?.[0]?.endsAt.toISOString()).toBe('2027-03-14T15:00:00.000Z')
 const fall=weeklyEventOccurrences(new Date('2027-10-31T14:00:00Z'),new Date('2027-10-31T15:00:00Z'),'America/New_York',1)
 expect(fall?.[0]?.startsAt.toISOString()).toBe('2027-11-07T15:00:00.000Z')
})
test('ambiguous and nonexistent weekly clock times reject the whole series',()=>{
 expect(weeklyEventOccurrences(new Date('2027-03-07T07:30:00Z'),new Date('2027-03-07T09:00:00Z'),'America/New_York',1)).toBeNull()
 expect(weeklyEventOccurrences(new Date('2027-10-31T05:30:00Z'),new Date('2027-10-31T07:00:00Z'),'America/New_York',1)).toBeNull()
 expect(weeklyEventOccurrences(new Date('2027-01-03T10:00:00Z'),new Date('2027-01-03T11:00:00Z'),'Africa/Accra',26)).toHaveLength(26)
})
