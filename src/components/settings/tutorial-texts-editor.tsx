'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Save, Loader2, RotateCcw, BookOpen, MessageSquare, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

// ── Default tutorial steps per role ──────────────────────────

interface TutorialStep {
  id: string
  title: string
  description: string
}

interface RoleSteps {
  role: string
  label: string
  steps: TutorialStep[]
}

const DEFAULT_STEPS: RoleSteps[] = [
  {
    role: 'admin',
    label: 'Administrador',
    steps: [
      { id: 'admin-0', title: 'Bienvenido a JO-Administrativo', description: 'Tu sistema está recién instalado. Antes de poder vender, necesitamos configurar los datos básicos. Te guiaremos paso a paso para que en unos minutos estés operando.' },
      { id: 'admin-1', title: 'Menú de Navegación', description: 'Desde aquí accedes a todas las secciones del sistema. Vamos a ir moviéndonos por cada una según la necesites.' },
      { id: 'admin-2', title: 'Vamos a Configurar', description: 'Primero vamos a la sección de Configuración para poner los datos de tu empresa, las tasas de cambio y demás datos antes de empezar a vender.' },
      { id: 'admin-3', title: 'Datos de la Empresa', description: 'Registra aquí el nombre de tu negocio, identificación fiscal, correo, teléfono y dirección. Estos datos aparecen en tus comprobantes de venta y reportes.' },
      { id: 'admin-4', title: 'Tasa de Cambio', description: 'Configura la moneda de referencia y la tasa de cambio. Puedes actualizar con las tasas oficiales o ingresar una manualmente. Esto es clave para los precios.' },
      { id: 'admin-5', title: 'Impuesto I.V.A.', description: 'Activa o desactiva el IVA y define el porcentaje (por defecto 16%). Si tu negocio cobra IVA, activa esta opción antes de la primera venta.' },
      { id: 'admin-6', title: 'Crear Categorías', description: 'Define las categorías para organizar tu catálogo: Alimentos, Bebidas, Limpieza, etc. Se usan como filtros en el Punto de Venta.' },
      { id: 'admin-7', title: 'Crear Productos', description: 'Sin productos no hay nada que vender. Vamos a la sección de Productos para crear tu catálogo.' },
      { id: 'admin-8', title: 'Abrir Caja', description: 'El último paso antes de vender. Sin caja abierta el Punto de Venta está bloqueado.' },
      { id: 'admin-9', title: 'Punto de Venta', description: 'Ahora sí, tu sistema está listo. Aquí procesarás todas las ventas diarias.' },
      { id: 'admin-10', title: 'Tutorial Completado', description: 'Tu sistema está listo para operar. Recuerda: abre caja al inicio del turno, ciérrala al final.' },
    ],
  },
  {
    role: 'gerente',
    label: 'Gerente',
    steps: [
      { id: 'gerente-0', title: 'Bienvenido a JO-Administrativo', description: 'Hola Gerente. Te mostraremos las funciones principales a las que tienes acceso y cómo usar el sistema diariamente.' },
      { id: 'gerente-1', title: 'Menú de Navegación', description: 'Desde aquí accedes a todas las secciones disponibles para tu rol.' },
      { id: 'gerente-2', title: 'Productos e Inventario', description: 'Aquí puedes crear y gestionar productos. Es importante tener productos registrados para poder vender.' },
      { id: 'gerente-3', title: 'Caja', description: 'Para poder vender necesitas una caja abierta. Presiona "Abrir Caja" con el monto inicial del día.' },
      { id: 'gerente-4', title: 'Punto de Venta', description: 'Con productos y caja abierta, estás listo para vender.' },
      { id: 'gerente-5', title: 'Tutorial Completado', description: 'Ya conoces las funciones principales. Puedes ver este tutorial de nuevo desde tu menú de perfil.' },
    ],
  },
  {
    role: 'cajero',
    label: 'Cajero',
    steps: [
      { id: 'cajero-0', title: 'Bienvenido a JO-Administrativo', description: 'Hola Cajero. Te mostraremos cómo usar el Punto de Venta para procesar ventas rápidamente.' },
      { id: 'cajero-1', title: 'Tu Menú', description: 'Como cajero tienes acceso al Punto de Venta y a la sección de Caja.' },
      { id: 'cajero-2', title: 'Punto de Venta', description: 'Aquí procesas todas las ventas. Si la caja no está abierta, verás un mensaje de bloqueo.' },
      { id: 'cajero-3', title: 'Buscar Productos', description: 'Escribe el nombre o escanea el código de barras para agregarlo a la venta.' },
      { id: 'cajero-4', title: 'Cobrar', description: 'Cuando tengas productos en el carrito, presiona aquí para procesar el pago.' },
      { id: 'cajero-5', title: 'Tutorial Completado', description: 'Ya estás listo para procesar ventas. Puedes ver este tutorial de nuevo desde tu menú de perfil.' },
    ],
  },
  {
    role: 'vendedor',
    label: 'Vendedor',
    steps: [
      { id: 'vendedor-0', title: 'Bienvenido a JO-Administrativo', description: 'Hola Vendedor. Te mostraremos como usar el sistema para registrar ventas y gestionar clientes.' },
      { id: 'vendedor-1', title: 'Tu Menú', description: 'Como vendedor tienes acceso al Punto de Venta, Productos y Clientes.' },
      { id: 'vendedor-2', title: 'Punto de Venta', description: 'Aquí procesas las ventas. Si no hay caja abierta, verás un bloqueo.' },
      { id: 'vendedor-3', title: 'Clientes', description: 'Registra clientes, consulta sus datos y genera estados de cuenta para ventas a credito.' },
      { id: 'vendedor-4', title: 'Tutorial Completado', description: 'Ya sabes lo fundamental. Puedes ver este tutorial de nuevo desde tu menú de perfil.' },
    ],
  },
]

export function TutorialTextsEditor() {
  const [customTexts, setCustomTexts] = useState<Record<string, Record<string, { title: string; description: string }>>>({})
  const [tutorialAutoShow, setTutorialAutoShow] = useState(true)
  const [selectedRole, setSelectedRole] = useState('admin')
  const [selectedStepId, setSelectedStepId] = useState<string>('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTexts = async () => {
      try {
        const settings = await api.get<{ tutorialTexts: Record<string, unknown> }>('/api/settings')
        if (settings?.tutorialTexts && typeof settings.tutorialTexts === 'object') {
          const raw = settings.tutorialTexts as Record<string, unknown>
          // Extract _config.autoShow separately
          const config = raw._config as { autoShow?: boolean } | undefined
          if (config && typeof config.autoShow === 'boolean') {
            setTutorialAutoShow(config.autoShow)
          }
          // Filter out _config from role texts
          const { _config, ...roleTexts } = raw
          setCustomTexts(roleTexts as Record<string, Record<string, { title: string; description: string }>>)
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false)
      }
    }
    loadTexts()
  }, [])

  const currentRoleSteps = DEFAULT_STEPS.find(r => r.role === selectedRole)
  const currentSteps = currentRoleSteps?.steps || []

  const getEffectiveText = (stepId: string, field: 'title' | 'description') => {
    const custom = customTexts[selectedRole]?.[stepId]?.[field]
    const defaultStep = currentSteps.find(s => s.id === stepId)
    return custom || defaultStep?.[field] || ''
  }

  const handleStepSelect = (stepId: string) => {
    setSelectedStepId(stepId)
    setEditTitle(getEffectiveText(stepId, 'title'))
    setEditDescription(getEffectiveText(stepId, 'description'))
  }

  useEffect(() => {
    if (currentSteps.length > 0 && !selectedStepId) {
      handleStepSelect(currentSteps[0].id)
    }
  }, [selectedRole])

  const saveTexts = async () => {
    setSaving(true)
    try {
      // Save current edit before saving
      const updatedTexts = { ...customTexts }
      if (selectedStepId && (editTitle || editDescription)) {
        if (!updatedTexts[selectedRole]) {
          updatedTexts[selectedRole] = {}
        }
        const defaultStep = currentSteps.find(s => s.id === selectedStepId)
        const isDefaultTitle = editTitle === defaultStep?.title
        const isDefaultDescription = editDescription === defaultStep?.description

        if (isDefaultTitle && isDefaultDescription) {
          delete updatedTexts[selectedRole][selectedStepId]
          if (Object.keys(updatedTexts[selectedRole]).length === 0) {
            delete updatedTexts[selectedRole]
          }
        } else {
          updatedTexts[selectedRole][selectedStepId] = { title: editTitle, description: editDescription }
        }
      }

      // Include _config with autoShow setting
      const fullTexts = { ...updatedTexts, _config: { autoShow: tutorialAutoShow } }
      await api.put('/api/settings', { tutorialTexts: fullTexts })
      setCustomTexts(updatedTexts)
      toast.success('Textos del tutorial guardados')
    } catch {
      toast.error('Error al guardar textos del tutorial')
    } finally {
      setSaving(false)
    }
  }

  const handleAutoShowChange = async (checked: boolean) => {
    setTutorialAutoShow(checked)
    try {
      // Get current tutorialTexts and update _config
      const settings = await api.get<{ tutorialTexts: Record<string, unknown> }>('/api/settings')
      const raw = settings?.tutorialTexts && typeof settings.tutorialTexts === 'object'
        ? { ...(settings.tutorialTexts as Record<string, unknown>) }
        : {}
      const { _config, ...roleTexts } = raw
      const mergedConfig = { ...(typeof _config === 'object' ? _config : {}), autoShow: checked }
      const fullTexts = { ...roleTexts, _config: mergedConfig }
      await api.put('/api/settings', { tutorialTexts: fullTexts })
      toast.success(checked ? 'Tutorial automatico activado' : 'Tutorial automatico desactivado')
    } catch {
      setTutorialAutoShow(!checked)
      toast.error('Error al cambiar la configuracion del tutorial')
    }
  }

  const resetAllTexts = () => {
    setCustomTexts({})
    // Preserve the _config when resetting texts
    api.put('/api/settings', { tutorialTexts: { _config: { autoShow: tutorialAutoShow } } }).catch(() => {})
    toast.info('Textos restablecidos a valores por defecto')
  }

  const hasCustomText = (stepId: string) => {
    return !!customTexts[selectedRole]?.[stepId]
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Auto-show toggle card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
                {tutorialAutoShow ? <Eye className="h-4.5 w-4.5 text-primary" /> : <EyeOff className="h-4.5 w-4.5 text-muted-foreground" />}
              </div>
              <div>
                <CardTitle className="text-base">Mostrar tutorial automaticamente</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {tutorialAutoShow
                    ? 'Los usuarios que inicien sesion por primera vez veran el tutorial de configuracion al entrar al sistema.'
                    : 'Los nuevos usuarios no veran el tutorial automaticamente. Podran iniciarlo manualmente desde el menu de perfil.'}
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={tutorialAutoShow}
              onCheckedChange={handleAutoShowChange}
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Textos del Tutorial
              </CardTitle>
              <CardDescription>Personaliza los mensajes que se muestran en cada paso del tutorial para cada rol</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetAllTexts}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Restaurar
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={saveTexts}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                Guardar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Role selector + step list */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={selectedRole} onValueChange={(v) => { setSelectedRole(v); setSelectedStepId('') }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_STEPS.map(r => (
                      <SelectItem key={r.role} value={r.role}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Pasos ({currentSteps.length})</Label>
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                  {currentSteps.map((step, idx) => (
                    <button
                      key={step.id}
                      onClick={() => handleStepSelect(step.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all flex items-center justify-between ${
                        selectedStepId === step.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}
                    >
                      <span className="truncate">{idx + 1}. {getEffectiveText(step.id, 'title')}</span>
                      {hasCustomText(step.id) && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-2 shrink-0">Editado</Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p><Badge variant="secondary" className="text-[10px] px-1.5 py-0">Editado</Badge> = texto personalizado (no es el por defecto)</p>
                <p>Los cambios solo guardan los textos modificados. Los demás usan los valores originales del sistema.</p>
              </div>
            </div>

            {/* Right: Editor */}
            <div className="lg:col-span-2 space-y-4">
              {selectedStepId ? (
                <>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Título del Paso
                    </Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Título del paso..."
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Descripción del Paso
                    </Label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Descripción del paso..."
                      rows={5}
                      className="resize-y"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este es el texto que aparece en el cuadro de diálogo del tutorial.
                    </p>
                  </div>

                  <Separator />

                  <div className="rounded-lg border bg-muted/50 p-4">
                    <p className="text-sm font-medium mb-2">Vista previa</p>
                    <div className="rounded-lg border bg-popover p-4 shadow-sm">
                      <h4 className="text-base font-semibold mb-1">{editTitle || 'Sin título'}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {editDescription || 'Sin descripción'}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <p>Selecciona un paso para editar su texto</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
