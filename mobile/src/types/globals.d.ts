/**
 * Minimal ambient declarations for this scaffold.
 *
 * `process.env.EXPO_PUBLIC_*` is replaced at bundle time by the Expo babel
 * preset, but the value must also typecheck. React Native's shipped types do
 * not declare a global `process`, and this project deliberately avoids
 * @types/node — so declare exactly what the API client reads.
 *
 * If @types/node is ever added to devDependencies, delete this file (its
 * `process` declaration would collide with Node's).
 */
declare const process: {
  readonly env: {
    readonly NODE_ENV?: 'development' | 'production' | 'test'
    /** iEventPlux web deployment base URL, inlined by the Expo babel preset. */
    readonly EXPO_PUBLIC_API_BASE_URL?: string
  }
}
