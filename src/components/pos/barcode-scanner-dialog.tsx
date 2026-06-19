'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Button } from '@/components/ui/button'
import { X, Camera, CameraOff, SwitchCamera } from 'lucide-react'
import { toast } from 'sonner'

interface BarcodeScannerDialogProps {
  open: boolean
  onClose: () => void
  onScan: (barcode: string) => boolean
}

export function BarcodeScannerDialog({ open, onClose, onScan }: BarcodeScannerDialogProps) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastScanRef = useRef<string>('')
  const lastScanTimeRef = useRef<number>(0)
  const callbackRef = useRef(onScan)

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = onScan
  }, [onScan])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch {
        // Scanner might already be stopped
      }
      try {
        scannerRef.current.clear()
      } catch {
        // Clear might fail if already cleared
      }
      scannerRef.current = null
    }
    setScanning(false)
  }, [])

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return

    setError(null)

    try {
      // Create a unique element ID for the scanner
      const scannerId = 'barcode-scanner-' + Date.now()
      // Clear previous content
      containerRef.current.innerHTML = `<div id="${scannerId}" style="width:100%;height:100%"></div>`

      const scanner = new Html5Qrcode(scannerId)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode },
        {
          fps: 10,
          qrbox: function(viewfinderWidth, viewfinderHeight) {
            const minDim = Math.min(viewfinderWidth, viewfinderHeight)
            const qrboxSize = Math.floor(minDim * 0.7)
            return { width: Math.max(qrboxSize, 150), height: Math.max(Math.floor(qrboxSize * 0.5), 100) }
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Debounce: ignore same barcode within 3 seconds
          const now = Date.now()
          if (decodedText === lastScanRef.current && now - lastScanTimeRef.current < 3000) {
            return
          }
          lastScanRef.current = decodedText
          lastScanTimeRef.current = now

          // Vibrate if available (common on mobile)
          if (navigator.vibrate) {
            navigator.vibrate(100)
          }

          toast.success(`Codigo escaneado: ${decodedText}`)
          const success = callbackRef.current(decodedText.trim())
          if (success) {
            setTimeout(() => onClose(), 400)
          }
        },
        () => {
          // QR code not found in frame - this is expected, do nothing
        }
      )

      setScanning(true)
    } catch (err) {
      console.error('Camera error:', err)
      const message = err instanceof Error ? err.message : String(err)

      if (message.includes('NotAllowedError') || message.includes('Permission')) {
        setError('Permiso de camara denegado. Activa el acceso a la camara en la configuracion del navegador.')
      } else if (message.includes('NotFoundError') || message.includes('Requested device not found')) {
        setError('No se encontro una camara disponible en este dispositivo.')
      } else if (message.includes('InsecureContext')) {
        setError('La camara requiere una conexion segura (HTTPS).')
      } else {
        setError(`Error al iniciar la camara: ${message}`)
      }
      scannerRef.current = null
    }
  }, [facingMode])

  const handleToggleCamera = useCallback(async () => {
    await stopScanner()
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }, [stopScanner])

  // Start/stop scanner based on open state
  useEffect(() => {
    if (open) {
      // Small delay to ensure the container is rendered
      const timer = setTimeout(() => startScanner(), 300)
      return () => clearTimeout(timer)
    } else {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facingMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Scanner area */}
      <div className="flex-1 relative overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />

        {/* Scanning indicator */}
        {scanning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium">Escaneando...</span>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="text-center text-white space-y-4 max-w-sm">
              <CameraOff className="h-12 w-12 mx-auto opacity-60" />
              <p className="text-sm">{error}</p>
              <Button
                variant="outline"
                className="bg-white/10 text-white border-white/30 hover:bg-white/20"
                onClick={startScanner}
              >
                Reintentar
              </Button>
            </div>
          </div>
        )}

        {/* Custom crosshair overlay when scanning */}
        {scanning && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative">
              <div className="w-56 h-36 sm:w-64 sm:h-40 border-2 border-white/40 rounded-lg" />
              {/* Corner accents */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-3 border-l-3 border-white rounded-tl-md" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-3 border-r-3 border-white rounded-tr-md" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-3 border-l-3 border-white rounded-bl-md" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-3 border-r-3 border-white rounded-br-md" />
              {/* Scan line animation */}
              <div className="absolute left-1 right-1 top-0 h-0.5 bg-green-400/80 shadow-lg shadow-green-400/50 animate-scan-line" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-black/80 backdrop-blur-sm p-4 space-y-3">
        <p className="text-white/70 text-xs text-center">
          Apunta la camara al codigo de barras del producto
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full bg-white/10 text-white border-white/30 hover:bg-white/20"
            onClick={handleToggleCamera}
            title="Cambiar camara"
          >
            <SwitchCamera className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-14 w-14 rounded-full bg-red-500/20 text-white border-red-400/50 hover:bg-red-500/30"
            onClick={onClose}
            title="Cerrar escaner"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Scan line animation style */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes barcode-scan-line {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
        .animate-scan-line {
          animation: barcode-scan-line 2.5s ease-in-out infinite;
        }
        .border-t-3 { border-top-width: 3px; }
        .border-b-3 { border-bottom-width: 3px; }
        .border-l-3 { border-left-width: 3px; }
        .border-r-3 { border-right-width: 3px; }
      `}} />
    </div>
  )
}
