#!/bin/bash
# Neon Blaster launcher for EmuELEC (and other PortMaster-compatible firmwares).
# Copy this file and the "neonblaster" folder into /storage/roms/ports/.

XDG_DATA_HOME=${XDG_DATA_HOME:-$HOME/.local/share}

if [ -d "/opt/system/Tools/PortMaster/" ]; then
  controlfolder="/opt/system/Tools/PortMaster"
elif [ -d "/opt/tools/PortMaster/" ]; then
  controlfolder="/opt/tools/PortMaster"
elif [ -d "$XDG_DATA_HOME/PortMaster/" ]; then
  controlfolder="$XDG_DATA_HOME/PortMaster"
else
  controlfolder="/roms/ports/PortMaster"
fi

if [ -f "$controlfolder/control.txt" ]; then
  source "$controlfolder/control.txt"
  [ -f "${controlfolder}/mod_${CFW_NAME}.txt" ] && source "${controlfolder}/mod_${CFW_NAME}.txt"
  get_controls
fi

# Find the game folder next to this script, whatever the roms path is.
GAMEDIR="$(cd "$(dirname "$0")" && pwd)/neonblaster"
[ -d "$GAMEDIR" ] || GAMEDIR="/storage/roms/ports/neonblaster"
cd "$GAMEDIR" || exit 1
> "$GAMEDIR/log.txt" && exec > >(tee "$GAMEDIR/log.txt") 2>&1

# Keep saves (high score) inside the game folder.
export XDG_DATA_HOME="$GAMEDIR/saves"
mkdir -p "$XDG_DATA_HOME"
[ -n "$sdl_controllerconfig" ] && export SDL_GAMECONTROLLERCONFIG="$sdl_controllerconfig"

LOVE_FILE="$GAMEDIR/neonblaster.love"
runtime="love_11.5"

if [ -f "$controlfolder/runtimes/$runtime/love.txt" ]; then
  # Newer PortMaster: runtime ships a helper that sets LOVE_RUN / LOVE_BINARY.
  source "$controlfolder/runtimes/$runtime/love.txt"
  [ -n "$GPTOKEYB" ] && $GPTOKEYB "$(basename "$LOVE_BINARY")" &
  [ "$(type -t pm_platform_helper)" = "function" ] && pm_platform_helper "$LOVE_BINARY"
  $LOVE_RUN "$LOVE_FILE"
elif [ -f "$controlfolder/libs/${runtime}.squashfs" ] || [ -f "$controlfolder/harbourmaster" ]; then
  # Older PortMaster: mount the LÖVE runtime squashfs (download it if missing).
  if [ ! -f "$controlfolder/libs/${runtime}.squashfs" ]; then
    $ESUDO "$controlfolder/harbourmaster" --quiet --no-check runtime_check "${runtime}.squashfs"
  fi
  $ESUDO mkdir -p "$GAMEDIR/runtime"
  $ESUDO umount "$GAMEDIR/runtime" 2>/dev/null
  $ESUDO mount "$controlfolder/libs/${runtime}.squashfs" "$GAMEDIR/runtime"
  export LD_LIBRARY_PATH="$GAMEDIR/runtime/libs:$LD_LIBRARY_PATH"
  [ -n "$GPTOKEYB" ] && $GPTOKEYB "love" &
  "$GAMEDIR/runtime/love" "$LOVE_FILE"
  $ESUDO umount "$GAMEDIR/runtime"
elif command -v love >/dev/null 2>&1; then
  love "$LOVE_FILE"
else
  echo "LOVE runtime not found. Install PortMaster (Ports menu or https://portmaster.games) and try again."
  sleep 5
fi

[ "$(type -t pm_finish)" = "function" ] && pm_finish
$ESUDO kill -9 $(pidof gptokeyb) 2>/dev/null
printf "\033c" > /dev/tty1 2>/dev/null
