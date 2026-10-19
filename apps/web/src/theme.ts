import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// 深海蓝灰：低饱和交互强调色 + 高对比石墨文字，统一 PrimeVue 组件色板。
const StudyTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f2f7fa',
      100: '#e3eef4',
      200: '#c5dce8',
      300: '#9dbed2',
      400: '#749fb9',
      500: '#4b809f',
      600: '#326889',
      700: '#285570',
      800: '#22445a',
      900: '#1d384b',
      950: '#122737',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.600}',
          inverseColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.900}',
          focusColor: '{primary.950}',
        },
        formField: {
          hoverBorderColor: '{primary.400}',
        },
      },
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.400}',
      offset: '2px',
    },
  },
});
export default StudyTheme;
