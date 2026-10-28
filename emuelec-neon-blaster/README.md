# Neon Blaster (EmuELEC / M25)

A small neon arcade shooter written in [LÖVE](https://love2d.org) 11.5, packaged as a PortMaster port so it shows up under **Ports** in EmuELEC.

## Install on the M25
1. On the console, make sure **PortMaster** is installed. In EmuELEC it's under *Ports* or the *Tools* menu. If it isn't there, get it from https://portmaster.games. PortMaster provides the LÖVE runtime.
2. Copy the contents of `NeonBlaster-EmuELEC.zip` into `/storage/roms/ports/` (over SMB, or on the SD card's `roms/ports` folder):
   ```
   roms/ports/Neon Blaster.sh
   roms/ports/neonblaster/neonblaster.love
   ```
3. In EmulationStation, choose *Update Games Lists* (or restart) and then launch **Neon Blaster** from Ports.

## Controls
| Action | Gamepad | Keyboard |
|---|---|---|
| Move | D-pad / left stick | Arrows / WASD |
| Fire (hold) | A (or Y / R1 / R2) | Z / Space |
| Bomb | B (or X / L1) | X |
| Pause | Start | Enter |
| Quit | Hold Select + Start | Hold Esc |

## Develop
- Source: `src/` (`main.lua`, `conf.lua`). Run it locally with `love src`.
- Rebuild the package: `cd src && zip -9 ../port/neonblaster/neonblaster.love main.lua conf.lua`.
