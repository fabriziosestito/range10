import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components'

// Brand ramp keyed to Fluent's shared green (#107C41 at stop 80, the Excel
// family green) — the closest shared color to Masters/Augusta green (#006747).
const greenBrand: BrandVariants = {
  10: '#02120a',
  20: '#042514',
  30: '#07361d',
  40: '#094927',
  50: '#0b562d',
  60: '#0d6334',
  70: '#0f713b',
  80: '#107C41',
  90: '#188b4a',
  100: '#249957',
  110: '#32a964',
  120: '#42bd73',
  130: '#63c588',
  140: '#86d5a3',
  150: '#aee5c1',
  160: '#d6f5e0',
}

export const lightTheme: Theme = createLightTheme(greenBrand)

export const darkTheme: Theme = createDarkTheme(greenBrand)

export const themeColors = { lightBackground: '#ffffff', darkBackground: '#292929' }
