import './assets/styles/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { telemetry } from '../../shared/telemetry.js'

import router from './router'
import App from './App.vue'

const app = createApp(App)
app.config.errorHandler = (error, _instance, info) => {
  telemetry.captureError('vue_error', error, { phase: info })
}

app.use(createPinia())
app.use(router)

app.mount('#app')
