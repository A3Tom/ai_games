import { createApp } from 'vue'
import { telemetry } from '../../shared/telemetry.js'

import App from './App.vue'
import './style.css'

const app = createApp(App)
app.config.errorHandler = (error, _instance, info) => {
  telemetry.captureError('vue_error', error, { phase: info })
}
app.mount('#app')
