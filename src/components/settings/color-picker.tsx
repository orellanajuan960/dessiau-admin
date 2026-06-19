'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// oklch values matching the format in globals.css
// Each color has light (:root) and dark (.dark) variants
const colorOptions = [
  {
    name: 'Esmeralda',
    value: 'emerald',
    color: '#059669',
    light: {
      primary: 'oklch(0.508 0.163 160)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.04 160)',
      accentFg: 'oklch(0.292 0.06 160)',
    },
    dark: {
      primary: 'oklch(0.627 0.163 160)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.04 160)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
  {
    name: 'Azul',
    value: 'blue',
    color: '#2563eb',
    light: {
      primary: 'oklch(0.546 0.245 262.881)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.04 262.881)',
      accentFg: 'oklch(0.292 0.06 262.881)',
    },
    dark: {
      primary: 'oklch(0.685 0.196 262.881)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.04 262.881)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
  {
    name: 'Violeta',
    value: 'purple',
    color: '#7c3aed',
    light: {
      primary: 'oklch(0.541 0.281 293.009)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.04 293.009)',
      accentFg: 'oklch(0.292 0.06 293.009)',
    },
    dark: {
      primary: 'oklch(0.685 0.222 293.009)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.04 293.009)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
  {
    name: 'Rojo',
    value: 'red',
    color: '#dc2626',
    light: {
      primary: 'oklch(0.577 0.245 27.325)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.04 27.325)',
      accentFg: 'oklch(0.292 0.06 27.325)',
    },
    dark: {
      primary: 'oklch(0.704 0.191 22.216)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.04 22.216)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
  {
    name: 'Naranja',
    value: 'orange',
    color: '#ea580c',
    light: {
      primary: 'oklch(0.637 0.237 47.604)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.04 47.604)',
      accentFg: 'oklch(0.292 0.06 47.604)',
    },
    dark: {
      primary: 'oklch(0.766 0.187 47.604)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.04 47.604)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
  {
    name: 'Rosa',
    value: 'pink',
    color: '#db2777',
    light: {
      primary: 'oklch(0.592 0.249 342.258)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.04 342.258)',
      accentFg: 'oklch(0.292 0.06 342.258)',
    },
    dark: {
      primary: 'oklch(0.708 0.199 342.258)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.04 342.258)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
  {
    name: 'Cyan',
    value: 'cyan',
    color: '#0891b2',
    light: {
      primary: 'oklch(0.522 0.135 218.811)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.04 218.811)',
      accentFg: 'oklch(0.292 0.06 218.811)',
    },
    dark: {
      primary: 'oklch(0.685 0.149 218.811)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.04 218.811)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
  {
    name: 'Slate',
    value: 'slate',
    color: '#475569',
    light: {
      primary: 'oklch(0.398 0.02 255)',
      fg: 'oklch(0.995 0.002 155)',
      accent: 'oklch(0.943 0.02 255)',
      accentFg: 'oklch(0.292 0.03 255)',
    },
    dark: {
      primary: 'oklch(0.568 0.025 255)',
      fg: 'oklch(0.145 0.015 155)',
      accent: 'oklch(0.269 0.02 255)',
      accentFg: 'oklch(0.985 0.002 155)',
    },
  },
]

export function getColorDef(value: string) {
  return colorOptions.find(c => c.value === value) || colorOptions[1]
}

/**
 * Generate the full CSS string for :root and .dark theme overrides.
 * This overrides ALL color variables that have emerald as default in globals.css,
 * including sidebar-accent, accent, and chart colors.
 */
function buildThemeCSS(primary: typeof colorOptions[0], secondary: typeof colorOptions[0]): string {
  return `
:root {
  --primary: ${primary.light.primary};
  --primary-foreground: ${primary.light.fg};
  --ring: ${primary.light.primary};
  --chart-1: ${primary.light.primary};
  --chart-2: ${secondary.light.primary};
  --accent: ${primary.light.accent};
  --accent-foreground: ${primary.light.accentFg};
  --sidebar-primary: ${primary.light.primary};
  --sidebar-primary-foreground: ${primary.light.fg};
  --sidebar-ring: ${primary.light.primary};
  --sidebar-accent: ${primary.light.accent};
  --sidebar-accent-foreground: ${primary.light.accentFg};
  --secondary: ${secondary.light.primary};
  --secondary-foreground: ${secondary.light.fg};
}
.dark {
  --primary: ${primary.dark.primary};
  --primary-foreground: ${primary.dark.fg};
  --ring: ${primary.dark.primary};
  --chart-1: ${primary.dark.primary};
  --chart-2: ${secondary.dark.primary};
  --accent: ${primary.dark.accent};
  --accent-foreground: ${primary.dark.accentFg};
  --sidebar-primary: ${primary.dark.primary};
  --sidebar-primary-foreground: ${primary.dark.fg};
  --sidebar-ring: ${primary.dark.primary};
  --sidebar-accent: ${primary.dark.accent};
  --sidebar-accent-foreground: ${primary.dark.accentFg};
  --secondary: ${secondary.dark.primary};
  --secondary-foreground: ${secondary.dark.fg};
}
  `
}

/**
 * Injects a <style> tag that overrides ALL CSS variables in :root and .dark.
 * This ensures no emerald/green leaks through from globals.css defaults.
 */
function injectThemeStyle(primary: typeof colorOptions[0], secondary: typeof colorOptions[0]) {
  let styleEl = document.getElementById('dynamic-theme') as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'dynamic-theme'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = buildThemeCSS(primary, secondary)
}

export function applyPrimaryColor(colorValue: string) {
  const primary = getColorDef(colorValue)
  const secondary = getColorDef('slate')
  injectThemeStyle(primary, secondary)
}

export function applySecondaryColor(colorValue: string) {
  const secondary = getColorDef(colorValue)
  const styleEl = document.getElementById('dynamic-theme') as HTMLStyleElement | null
  let primaryValue = 'blue'
  if (styleEl) {
    const match = styleEl.textContent?.match(/--primary:\s*(oklch\([^)]+\))/)
    if (match) {
      const found = colorOptions.find(c => c.light.primary === match[1] || c.dark.primary === match[1])
      if (found) primaryValue = found.value
    }
  }
  const primary = getColorDef(primaryValue)
  injectThemeStyle(primary, secondary)
}

export function applyBothColors(primaryValue: string, secondaryValue: string) {
  const primary = getColorDef(primaryValue)
  const secondary = getColorDef(secondaryValue)
  injectThemeStyle(primary, secondary)
}

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const selected = colorOptions.find(c => c.value === value) || colorOptions[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {colorOptions.map((color) => (
          <button
            key={color.value}
            onClick={() => onChange(color.value)}
            className={cn(
              'relative h-9 w-9 rounded-full border-2 transition-all hover:scale-110',
              value === color.value ? 'border-foreground ring-2 ring-offset-2 ring-offset-background' : 'border-transparent'
            )}
            style={{ backgroundColor: color.color }}
            title={color.name}
          >
            {value === color.value && (
              <Check className="h-4 w-4 text-white absolute inset-0 m-auto" />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: selected.color }} />
        <span className="text-sm text-muted-foreground">
          Seleccionado: <span className="font-medium text-foreground">{selected.name}</span>
        </span>
      </div>
    </div>
  )
}
