/**
 * Explicit entry point for the iEventPlux mobile scaffold.
 *
 * Equivalent to depending on "main": "node_modules/expo/AppEntry.js", but kept
 * as a first-party file so the registration is visible and lockfile-free
 * (this repo ships source only — see README.md).
 */
import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
