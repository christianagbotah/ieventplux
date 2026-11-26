import {describe, expect, test} from 'bun:test'
import {reconcileActivity} from './foreground-activity'
import type {NotificationItem} from '../api/client'
const row=(id:string,seconds:number,readAt?:string):NotificationItem=>({id,type:'FOLLOW',title:'New follower',body:'Activity',createdAt:new Date(seconds*1000).toISOString(),readAt})
describe('foreground notifications',()=>{
 test('initial history is not replayed as an alert',()=>expect(reconcileActivity(null,[row('a',10)]).fresh).toEqual([]))
 test('new unread activity appears once',()=>{
  const first=reconcileActivity(null,[row('a',10)])
  const next=reconcileActivity(first.cursor,[row('b',11),row('a',10)])
  expect(next.fresh.map(x=>x.id)).toEqual(['b'])
  expect(reconcileActivity(next.cursor,[row('b',11),row('a',10)]).fresh).toEqual([])
 })
 test('read updates and older rows never trigger a toast',()=>{
  const first=reconcileActivity(null,[row('a',10)])
  expect(reconcileActivity(first.cursor,[row('b',11,'read'),row('c',8)]).fresh).toEqual([])
 })
 test('equal timestamp new IDs and empty initial history work',()=>{
  const first=reconcileActivity(null,[])
  const next=reconcileActivity(first.cursor,[row('a',10)])
  expect(next.fresh.length).toBe(1)
  expect(reconcileActivity(next.cursor,[row('b',10),row('a',10)]).fresh.map(x=>x.id)).toEqual(['b'])
 })
})
