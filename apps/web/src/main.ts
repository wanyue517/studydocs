import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import './style.css';
import './refinements.css';

createApp(App)
  .use(createPinia())
  .use(PrimeVue, {
    theme: {
      preset: Aura,
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
