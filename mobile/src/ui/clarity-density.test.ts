import {describe,expect,test} from 'bun:test'
import {theme} from '../theme'
import {readFileSync} from 'node:fs'

describe('compact native visual hierarchy',()=>{
  test('default type scale separates body, labels and headings from touch size',()=>{
    const t=theme.typography
    expect(t.body).toBe(14)
    expect(t.caption).toBe(12)
    expect(t.label).toBe(13)
    expect(t.action).toBe(14)
    expect(t.title).toBe(20)
    expect(t.heading).toBe(24)
    expect(t.bodyLine/t.body).toBeGreaterThanOrEqual(1.4)
    expect(theme.touch.standard).toBeGreaterThanOrEqual(48)
    expect(theme.touch.compact).toBeGreaterThanOrEqual(44)
  })
  test('native discovery retains meaningful event information outside cover imagery',()=>{
    const source=readFileSync(new URL('../screens/DiscoverScreen.tsx',import.meta.url),'utf8')
    const row=source.slice(source.indexOf('function EventRow'),source.indexOf('const styles = StyleSheet.create'))
    expect(row).toContain('styles.eventDate')
    expect(row).not.toContain('styles.eventPosterShade')
    expect(row).not.toContain('iEVENTPLUX  ·  EXPERIENCE')
    expect(row).toContain('event.title')
    expect(row).toContain('priceLabel')
  })
  test('navigation supports system scaling without oversized normal-density labels',()=>{
    const source=readFileSync(new URL('../components/AppTabBar.tsx',import.meta.url),'utf8')
    expect(source).toContain('fontScale>=1.4')
    expect(source).toContain('allowFontScaling')
    expect(source).toContain('fontSize:11,lineHeight:15')
    expect(source).not.toContain('allowFontScaling={false}')
  })
})
