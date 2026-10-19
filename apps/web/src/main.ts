import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import PrimeVue from 'primevue/config';
import StudyTheme from './theme';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import './style.css';
import './refinements.css';
import './ui-system.css';

createApp(App)
  .use(createPinia())
  .use(ConfirmationService)
  .use(ToastService)
  .use(PrimeVue, {
    theme: {
      preset: StudyTheme,
      options: {
        darkModeSelector: false,
        cssLayer: false,
      },
    },
    locale: {
      accept: '确定',
      reject: '取消',
      close: '关闭',
      emptyMessage: '没有可选项',
      emptySearchMessage: '没有匹配结果',
    },
  })
  .mount('#app');
