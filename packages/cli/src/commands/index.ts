import { build } from './build'
import { check } from './check'
import { draw } from './draw'
import { init } from './init'
import { lab } from './lab'
import { lint } from './lint'
import { render } from './render'
import { scan } from './scan'
import { status } from './status'

export const commands = { status, lint, check, render, build, draw, init, lab, scan }
