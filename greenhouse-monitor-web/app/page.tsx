"use client"

import { useEffect, useState, useRef } from "react"
import mqtt from "mqtt"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import { motion, AnimatePresence } from "framer-motion"
import {
  Thermometer,
  Droplet,
  Gauge,
  BarChart2,
  AlertTriangle,
  Menu,
  X,
  RefreshCw,
  Leaf,
  Waves,
  Info,
  Download,
  Sun,
  Palette,
  Home,
  Activity,
  Settings,
  Clock,
} from "lucide-react"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

// ==================== CONFIGURACIÓN ====================

// MQTT - Debe coincidir con el Arduino
const MQTT_BROKER = "wss://broker.emqx.io:8084/mqtt"
const MQTT_TOPIC = "invernadero/sensores"

// Valores óptimos para los sensores
const HUMEDAD_SUELO_OPTIMA: [number, number] = [20, 60]
const TEMPERATURA_OPTIMA: [number, number] = [22, 28]
const HUMEDAD_AIRE_OPTIMA: [number, number] = [40, 70]
const TDS_OPTIMO: [number, number] = [100, 800]
const NIVEL_AGUA_OPTIMO: [number, number] = [300, 800]

// Número máximo de puntos en los gráficos
const TIEMPO_MAX = 30

// ==================== INTERFACES ====================

interface SensorData {
  temperature?: number
  humidity?: number
  soil_moisture?: number
  pressure?: number
  tds?: number
  water_level?: number
  light?: number
  color?: {
    r: number
    g: number
    b: number
  }
  timestamp?: number
}

// Función para convertir nivel de agua analógico a porcentaje
const waterLevelToPercent = (level: number | undefined): number => {
  if (level === undefined) return 0
  // Asumiendo que 0 es vacío y 1023 es lleno
  return Math.min(Math.max(Math.round((level / 1023) * 100), 0), 100)
}

// Función para interpretar la calidad del agua basada en TDS
const interpretWaterQuality = (tds: number | undefined): string => {
  if (tds === undefined) return "Desconocida"
  if (tds < 50) return "Excelente"
  if (tds < 200) return "Buena"
  if (tds < 500) return "Regular"
  if (tds < 1000) return "Pobre"
  return "Muy pobre"
}

// Función para interpretar el nivel de luz
const interpretLightLevel = (light: number | undefined): string => {
  if (light === undefined) return "Desconocido"
  if (light < 100) return "Muy bajo"
  if (light < 300) return "Bajo"
  if (light < 600) return "Moderado"
  if (light < 800) return "Alto"
  return "Muy alto"
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function GreenSenseMonitor() {
  // ==================== ESTADOS ====================
  const [sensorData, setSensorData] = useState<SensorData>({})
  const [sensorHistory, setSensorHistory] = useState<{
    soil_moisture: number[]
    temperature: number[]
    humidity: number[]
    tds: number[]
    water_level: number[]
  }>({
    soil_moisture: [],
    temperature: [],
    humidity: [],
    tds: [],
    water_level: [],
  })
  const [timeHistory, setTimeHistory] = useState<string[]>([])
  const [status, setStatus] = useState("Esperando conexión...")
  const [isConnected, setIsConnected] = useState(false)
  const [activeTab, setActiveTab] = useState("dashboard")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [chartTimespan, setChartTimespan] = useState(TIEMPO_MAX)

  // ==================== REFERENCIAS ====================
  const clientRef = useRef<mqtt.MqttClient | null>(null)
  const dataLogRef = useRef<SensorData[]>([])
  const connectionAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ==================== EFECTOS ====================
  useEffect(() => {
    setIsLoading(true)
    console.log("Iniciando conexión MQTT...")
    connectMQTT()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (clientRef.current) {
        console.log("Cerrando conexión MQTT")
        clientRef.current.end()
      }
    }
  }, [])

  // Función para conectar MQTT
  const connectMQTT = () => {
    try {
      console.log("Intentando conectar a MQTT broker:", MQTT_BROKER)
      clientRef.current = mqtt.connect(MQTT_BROKER, {
        clientId: `greensense_monitor_${Math.random().toString(16).substring(2, 10)}`,
        keepalive: 30,
        reconnectPeriod: 3000,
        connectTimeout: 30000,
        clean: true,
      })

      clientRef.current.on("connect", () => {
        console.log("Conectado a MQTT broker")
        setStatus("Conectado a MQTT")
        setIsConnected(true)
        clientRef.current?.subscribe(MQTT_TOPIC, { qos: 1 })
        connectionAttemptsRef.current = 0
      })

      clientRef.current.on("message", (topic, message) => {
        try {
          console.log("Mensaje MQTT recibido:", message.toString())
          const data = JSON.parse(message.toString()) as SensorData
          data.timestamp = Date.now()

          setSensorData((prev) => ({ ...prev, ...data }))
          dataLogRef.current.push(data)
          setLastUpdate(new Date())

          // Update time labels
          const now = new Date()
          const timeLabel = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`

          setTimeHistory((prev) => {
            const newHistory = [...prev]
            if (newHistory.length >= chartTimespan) {
              newHistory.shift()
            }
            newHistory.push(timeLabel)
            return newHistory
          })

          // Update sensor histories
          setSensorHistory((prev) => {
            const newHistory = { ...prev }

            if (typeof data.soil_moisture === "number") {
              if (newHistory.soil_moisture.length >= chartTimespan) {
                newHistory.soil_moisture.shift()
              }
              newHistory.soil_moisture.push(data.soil_moisture)
            }

            if (typeof data.temperature === "number") {
              if (newHistory.temperature.length >= chartTimespan) {
                newHistory.temperature.shift()
              }
              newHistory.temperature.push(data.temperature)
            }

            if (typeof data.humidity === "number") {
              if (newHistory.humidity.length >= chartTimespan) {
                newHistory.humidity.shift()
              }
              newHistory.humidity.push(data.humidity)
            }

            if (typeof data.tds === "number") {
              if (newHistory.tds.length >= chartTimespan) {
                newHistory.tds.shift()
              }
              newHistory.tds.push(data.tds)
            }

            if (typeof data.water_level === "number") {
              if (newHistory.water_level.length >= chartTimespan) {
                newHistory.water_level.shift()
              }
              newHistory.water_level.push(waterLevelToPercent(data.water_level))
            }

            return newHistory
          })

          // Salir del modo de carga después de recibir datos
          setIsLoading(false)
        } catch (error) {
          console.error("Error al procesar datos MQTT:", error)
          setStatus("Error al procesar datos: " + (error instanceof Error ? error.message : String(error)))
        }
      })

      clientRef.current.on("error", (err) => {
        console.error("Error MQTT:", err)
        setStatus(`Error de conexión: ${err.message}`)
        setIsConnected(false)
        connectionAttemptsRef.current++
      })

      clientRef.current.on("offline", () => {
        console.log("MQTT desconectado")
        setStatus("Desconectado del broker MQTT")
        setIsConnected(false)

        // Reconexión automática si está habilitada
        if (autoRefresh && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnect()
            reconnectTimeoutRef.current = null
          }, 5000)
        }
      })
    } catch (error) {
      console.error("Error al inicializar conexión MQTT:", error)
      setStatus("Error al inicializar conexión MQTT: " + (error instanceof Error ? error.message : String(error)))
      setIsConnected(false)
      connectionAttemptsRef.current++
    }

    // Establecer un timeout para salir del modo de carga después de 10 segundos
    // incluso si no hay datos, para evitar que la interfaz se quede bloqueada
    const loadingTimeout = setTimeout(() => {
      if (isLoading) {
        console.log("Timeout de carga alcanzado, mostrando interfaz")
        setIsLoading(false)
        if (!isConnected) {
          setStatus("No se recibieron datos. Verifica la conexión del Arduino.")
        }
      }
    }, 10000)

    return () => {
      clearTimeout(loadingTimeout)
    }
  }

  // ==================== FUNCIONES AUXILIARES ====================

  const getChartData = (dataType: "soil_moisture" | "temperature" | "humidity" | "tds" | "water_level") => {
    const datasets = []
    const colors = {
      soil_moisture: { border: "#10b981", background: "rgba(16, 185, 129, 0.2)" },
      temperature: { border: "#f97316", background: "rgba(249, 115, 22, 0.2)" },
      humidity: { border: "#3b82f6", background: "rgba(59, 130, 246, 0.2)" },
      tds: { border: "#8b5cf6", background: "rgba(139, 92, 246, 0.2)" },
      water_level: { border: "#06b6d4", background: "rgba(6, 182, 212, 0.2)" },
    }

    const labels = {
      soil_moisture: "Humedad del Suelo",
      temperature: "Temperatura",
      humidity: "Humedad del Aire",
      tds: "TDS (ppm)",
      water_level: "Nivel de Agua",
    }

    datasets.push({
      label: labels[dataType],
      data: sensorHistory[dataType],
      borderColor: colors[dataType].border,
      backgroundColor: colors[dataType].background,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: colors[dataType].border,
      fill: true,
    })

    // Add optimal range for each sensor type
    const optimalRanges = {
      soil_moisture: HUMEDAD_SUELO_OPTIMA,
      temperature: TEMPERATURA_OPTIMA,
      humidity: HUMEDAD_AIRE_OPTIMA,
      tds: TDS_OPTIMO,
      water_level: NIVEL_AGUA_OPTIMO,
    }

    if (optimalRanges[dataType]) {
      datasets.push({
        label: "Mínimo Óptimo",
        data: Array(timeHistory.length).fill(optimalRanges[dataType][0]),
        borderColor: "rgba(234, 179, 8, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })

      datasets.push({
        label: "Máximo Óptimo",
        data: Array(timeHistory.length).fill(optimalRanges[dataType][1]),
        borderColor: "rgba(234, 179, 8, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })
    }

    return {
      labels: timeHistory,
      datasets,
    }
  }

  const getChartOptions = (dataType: "soil_moisture" | "temperature" | "humidity" | "tds" | "water_level") => {
    const ranges = {
      soil_moisture: { min: 0, max: 100, unit: "%" },
      temperature: { min: 15, max: 35, unit: "°C" },
      humidity: { min: 0, max: 100, unit: "%" },
      tds: { min: 0, max: 1000, unit: "ppm" },
      water_level: { min: 0, max: 100, unit: "%" },
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: "easeOutQuart",
      },
      scales: {
        y: {
          min: ranges[dataType].min,
          max: ranges[dataType].max,
          grid: {
            color: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
          },
          ticks: {
            color: darkMode ? "#e2e8f0" : "#1f2937",
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            },
            callback: (value: number) => value + ranges[dataType].unit,
          },
          title: {
            display: true,
            text:
              dataType === "soil_moisture"
                ? "Humedad (%)"
                : dataType === "temperature"
                  ? "Temperatura (°C)"
                  : dataType === "humidity"
                    ? "Humedad (%)"
                    : dataType === "tds"
                      ? "TDS (ppm)"
                      : "Nivel (%)",
            color: darkMode ? "#e2e8f0" : "#1f2937",
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              weight: "bold",
            },
          },
        },
        x: {
          grid: {
            color: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
          },
          ticks: {
            color: darkMode ? "#e2e8f0" : "#1f2937",
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
          title: {
            display: true,
            text: "Tiempo",
            color: darkMode ? "#e2e8f0" : "#1f2937",
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              weight: "bold",
            },
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: darkMode ? "#e2e8f0" : "#1f2937",
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            },
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          backgroundColor: darkMode ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)",
          titleColor: darkMode ? "#e2e8f0" : "#1f2937",
          bodyColor: darkMode ? "#e2e8f0" : "#1f2937",
          borderColor: darkMode ? "#475569" : "#cbd5e1",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleFont: {
            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            weight: "bold",
          },
          bodyFont: {
            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          },
          callbacks: {
            label: (context: any) => `${context.dataset.label}: ${context.raw}${ranges[dataType].unit}`,
          },
        },
      },
    }
  }

  const getValueColor = (value: number | undefined, [min, max]: number[]) => {
    if (value === undefined) return "text-gray-400"
    return value >= min && value <= max ? "text-emerald-500" : "text-red-500"
  }

  const getStatusIndicator = () => {
    if (isConnected) {
      return "bg-emerald-500"
    } else {
      return "bg-red-500"
    }
  }

  const formatLastUpdate = () => {
    if (!lastUpdate) return "No hay datos"

    const now = new Date()
    const diff = now.getTime() - lastUpdate.getTime()

    if (diff < 60000) {
      return `Hace ${Math.floor(diff / 1000)} segundos`
    } else if (diff < 3600000) {
      return `Hace ${Math.floor(diff / 60000)} minutos`
    } else {
      return `${lastUpdate.toLocaleTimeString()}`
    }
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const reconnect = () => {
    setStatus("Reconectando...")
    if (clientRef.current) {
      clientRef.current.end()
    }

    setTimeout(() => {
      connectMQTT()
    }, 1000)
  }

  const exportData = (format: "csv" | "json") => {
    if (dataLogRef.current.length === 0) {
      alert("No hay datos para exportar")
      return
    }

    let content = ""
    let filename = `greensense_data_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`

    if (format === "csv") {
      // Create CSV header
      const headers = [
        "timestamp",
        "temperature",
        "humidity",
        "soil_moisture",
        "pressure",
        "tds",
        "water_level",
        "water_level_percent",
        "light",
        "light_interpretation",
        "water_quality",
        "color_r",
        "color_g",
        "color_b",
      ]
      content = headers.join(",") + "\n"

      // Add data rows
      dataLogRef.current.forEach((data) => {
        const row = headers.map((header) => {
          if (header === "timestamp" && data.timestamp) {
            return new Date(data.timestamp).toISOString()
          } else if (header === "color_r" && data.color) {
            return data.color.r
          } else if (header === "color_g" && data.color) {
            return data.color.g
          } else if (header === "color_b" && data.color) {
            return data.color.b
          } else if (header === "water_level_percent") {
            return waterLevelToPercent(data.water_level)
          } else if (header === "light_interpretation") {
            return interpretLightLevel(data.light)
          } else if (header === "water_quality") {
            return interpretWaterQuality(data.tds)
          }
          return data[header.replace(/_[rgb]$/, "") as keyof SensorData] !== undefined
            ? data[header as keyof SensorData]
            : ""
        })
        content += row.join(",") + "\n"
      })

      filename += ".csv"
    } else {
      // JSON format with enhanced data
      const enhancedData = dataLogRef.current.map((data) => ({
        ...data,
        water_level_percent: waterLevelToPercent(data.water_level),
        light_interpretation: interpretLightLevel(data.light),
        water_quality: interpretWaterQuality(data.tds),
        timestamp_iso: data.timestamp ? new Date(data.timestamp).toISOString() : undefined,
      }))
      content = JSON.stringify(enhancedData, null, 2)
      filename += ".json"
    }

    // Create download link
    const blob = new Blob([content], { type: format === "csv" ? "text/csv" : "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Cerrar panel de exportación
    setShowExportPanel(false)
  }

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  // ==================== RENDERIZADO ====================

  if (isLoading) {
    return (
      <div className={`min-h-screen ${darkMode ? "bg-slate-900" : "bg-white"} flex items-center justify-center`}>
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="mb-4"
            >
              <RefreshCw size={48} className={darkMode ? "text-emerald-500" : "text-emerald-600"} />
            </motion.div>
            <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-800"} mb-2`}>GreenSense</h1>
            <p className={darkMode ? "text-slate-300" : "text-slate-600"}>Conectando con el invernadero...</p>
            <p className={`mt-2 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Conectando a {MQTT_BROKER}
            </p>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen ${darkMode ? "dark bg-slate-900 text-white" : "bg-gray-50 text-slate-800"} font-sans`}
    >
      {/* Header */}
      <header
        className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} border-b p-4 sticky top-0 z-10 shadow-sm`}
      >
        <div className="container mx-auto flex justify-between items-center">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="text-xl md:text-2xl font-bold flex items-center"
          >
            <Leaf className={`mr-2 ${darkMode ? "text-emerald-500" : "text-emerald-600"}`} />
            <span className={darkMode ? "text-white" : "text-slate-800"}>Green</span>
            <span className={darkMode ? "text-emerald-500" : "text-emerald-600"}>Sense</span>
          </motion.h1>

          <div className="hidden md:flex space-x-2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                activeTab === "dashboard"
                  ? darkMode
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : darkMode
                    ? "hover:bg-slate-700 text-slate-300"
                    : "hover:bg-slate-100 text-slate-600"
              }`}
              onClick={() => setActiveTab("dashboard")}
            >
              <Home size={18} className="mr-1.5" /> Dashboard
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                activeTab === "environment"
                  ? darkMode
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : darkMode
                    ? "hover:bg-slate-700 text-slate-300"
                    : "hover:bg-slate-100 text-slate-600"
              }`}
              onClick={() => setActiveTab("environment")}
            >
              <Thermometer size={18} className="mr-1.5" /> Ambiente
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                activeTab === "water"
                  ? darkMode
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : darkMode
                    ? "hover:bg-slate-700 text-slate-300"
                    : "hover:bg-slate-100 text-slate-600"
              }`}
              onClick={() => setActiveTab("water")}
            >
              <Droplet size={18} className="mr-1.5" /> Agua
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                activeTab === "light"
                  ? darkMode
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : darkMode
                    ? "hover:bg-slate-700 text-slate-300"
                    : "hover:bg-slate-100 text-slate-600"
              }`}
              onClick={() => setActiveTab("light")}
            >
              <Sun size={18} className="mr-1.5" /> Luz
            </motion.button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-md ${darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
            >
              <Settings size={20} className={darkMode ? "text-slate-300" : "text-slate-600"} />
            </button>
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-md ${darkMode ? "bg-slate-700 text-yellow-400" : "bg-slate-100 text-slate-700"}`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
            <div className="md:hidden">
              <button onClick={toggleMobileMenu} className={`p-2 ${darkMode ? "text-white" : "text-slate-800"}`}>
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`absolute right-4 top-16 z-20 w-72 p-4 rounded-lg shadow-lg ${
              darkMode ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"
            }`}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Configuración</h3>
              <button
                onClick={() => setShowSettings(false)}
                className={`p-1 rounded-full ${darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <RefreshCw size={16} className="mr-2" />
                  <span className="text-sm">Reconexión automática</span>
                </div>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoRefresh
                      ? darkMode
                        ? "bg-emerald-500"
                        : "bg-emerald-600"
                      : darkMode
                        ? "bg-slate-600"
                        : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoRefresh ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center">
                  <Clock size={16} className="mr-2" />
                  <span className="text-sm">Intervalo de gráficos</span>
                </div>
                <select
                  value={chartTimespan}
                  onChange={(e) => setChartTimespan(Number(e.target.value))}
                  className={`w-full p-2 rounded-md text-sm ${
                    darkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-300 text-slate-800"
                  } border`}
                >
                  <option value={10}>Últimos 10 puntos</option>
                  <option value={30}>Últimos 30 puntos</option>
                  <option value={60}>Últimos 60 puntos</option>
                  <option value={120}>Últimos 120 puntos</option>
                </select>
              </div>

              <button
                onClick={() => setShowExportPanel(!showExportPanel)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                  darkMode
                    ? "bg-slate-700 hover:bg-slate-600 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                }`}
              >
                <Download size={16} />
                Exportar Datos
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} border-b md:hidden`}
          >
            <div className="container mx-auto py-2 px-4 flex flex-col space-y-2">
              <button
                className={`p-2 rounded-md text-left flex items-center ${
                  activeTab === "dashboard"
                    ? darkMode
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("dashboard")
                  setIsMobileMenuOpen(false)
                }}
              >
                <Home size={18} className="mr-2" /> Dashboard
              </button>
              <button
                className={`p-2 rounded-md text-left flex items-center ${
                  activeTab === "environment"
                    ? darkMode
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("environment")
                  setIsMobileMenuOpen(false)
                }}
              >
                <Thermometer size={18} className="mr-2" /> Ambiente
              </button>
              <button
                className={`p-2 rounded-md text-left flex items-center ${
                  activeTab === "water"
                    ? darkMode
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("water")
                  setIsMobileMenuOpen(false)
                }}
              >
                <Droplet size={18} className="mr-2" /> Agua
              </button>
              <button
                className={`p-2 rounded-md text-left flex items-center ${
                  activeTab === "light"
                    ? darkMode
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("light")
                  setIsMobileMenuOpen(false)
                }}
              >
                <Sun size={18} className="mr-2" /> Luz
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="container mx-auto p-4">
        {/* Status Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={`mb-6 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}
        >
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${getStatusIndicator()} mr-2 animate-pulse`}></div>
            <span className={darkMode ? "text-slate-300" : "text-slate-600"}>{status}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              <Clock size={14} className="inline mr-1" /> {formatLastUpdate()}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={reconnect}
              className={`${
                darkMode
                  ? "bg-slate-700 hover:bg-slate-600 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-800"
              } rounded-md px-3 py-1 text-sm flex items-center`}
            >
              <RefreshCw size={14} className="mr-1" /> Reconectar
            </motion.button>
          </div>
        </motion.div>

        {/* Export Data Panel */}
        <AnimatePresence>
          {showExportPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`mb-6 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold flex items-center">
                  <Download size={18} className="mr-2" /> Exportar Datos
                </h3>
                <button
                  onClick={() => setShowExportPanel(false)}
                  className={`p-1 rounded-full ${darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => exportData("csv")}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                    darkMode
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-emerald-500 hover:bg-emerald-600 text-white"
                  }`}
                >
                  <Download size={16} />
                  Exportar como CSV
                </button>
                <button
                  onClick={() => exportData("json")}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                    darkMode
                      ? "bg-slate-700 hover:bg-slate-600 text-white"
                      : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                  }`}
                >
                  <Download size={16} />
                  Exportar como JSON
                </button>
              </div>
              <p className={`mt-4 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Se exportarán {dataLogRef.current.length} registros de datos desde el inicio de la sesión.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content based on active tab */}
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {/* Temperature Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                      <Thermometer size={18} className={`mr-2 ${darkMode ? "text-orange-400" : "text-orange-500"}`} />{" "}
                      Temperatura
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-emerald-500"
                          ? darkMode
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-emerald-100 text-emerald-700"
                          : darkMode
                            ? "bg-red-500/20 text-red-400"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-emerald-500"
                        ? "Óptimo"
                        : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span className={`text-4xl font-bold ${darkMode ? "text-orange-400" : "text-orange-500"}`}>
                      {sensorData.temperature?.toFixed(1) ?? "--"}°C
                    </span>
                  </div>
                  <div className={`relative h-2 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-2`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-orange-400" : "bg-orange-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${((sensorData.temperature ?? 20) - 15) * 5}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>15°C</span>
                    <span>25°C</span>
                    <span>35°C</span>
                  </div>
                </motion.div>

                {/* Humidity Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                      <Droplet size={18} className={`mr-2 ${darkMode ? "text-blue-400" : "text-blue-500"}`} /> Humedad
                      Aire
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-emerald-500"
                          ? darkMode
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-emerald-100 text-emerald-700"
                          : darkMode
                            ? "bg-red-500/20 text-red-400"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-emerald-500"
                        ? "Óptimo"
                        : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span className={`text-4xl font-bold ${darkMode ? "text-blue-400" : "text-blue-500"}`}>
                      {sensorData.humidity?.toFixed(1) ?? "--"}%
                    </span>
                  </div>
                  <div className={`relative h-2 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-2`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-blue-400" : "bg-blue-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${sensorData.humidity ?? 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </motion.div>

                {/* Soil Moisture Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                      <Droplet size={18} className={`mr-2 ${darkMode ? "text-emerald-400" : "text-emerald-500"}`} />{" "}
                      Humedad Suelo
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-emerald-500"
                          ? darkMode
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-emerald-100 text-emerald-700"
                          : darkMode
                            ? "bg-red-500/20 text-red-400"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-emerald-500"
                        ? "Óptimo"
                        : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span className={`text-4xl font-bold ${darkMode ? "text-emerald-400" : "text-emerald-500"}`}>
                      {sensorData.soil_moisture?.toFixed(1) ?? "--"}%
                    </span>
                  </div>
                  <div className={`relative h-2 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-2`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-emerald-400" : "bg-emerald-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${sensorData.soil_moisture ?? 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Secondary Metrics */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                  className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Activity size={18} className="mr-2" /> Métricas Adicionales
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Gauge className={`mr-2 ${darkMode ? "text-purple-400" : "text-purple-500"}`} size={16} />
                        <span>Presión</span>
                      </div>
                      <span className={`font-medium ${darkMode ? "text-purple-400" : "text-purple-500"}`}>
                        {sensorData.pressure?.toFixed(1) ?? "--"} hPa
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Waves className={`mr-2 ${darkMode ? "text-purple-400" : "text-purple-500"}`} size={16} />
                        <span>TDS</span>
                      </div>
                      <span className={`font-medium ${darkMode ? "text-purple-400" : "text-purple-500"}`}>
                        {sensorData.tds?.toFixed(1) ?? "--"} ppm
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Waves className={`mr-2 ${darkMode ? "text-cyan-400" : "text-cyan-500"}`} size={16} />
                        <span>Nivel de Agua</span>
                      </div>
                      <span className={`font-medium ${darkMode ? "text-cyan-400" : "text-cyan-500"}`}>
                        {waterLevelToPercent(sensorData.water_level)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Sun className={`mr-2 ${darkMode ? "text-yellow-400" : "text-yellow-500"}`} size={16} />
                        <span>Luz</span>
                      </div>
                      <span className={`font-medium ${darkMode ? "text-yellow-400" : "text-yellow-500"}`}>
                        {interpretLightLevel(sensorData.light)}
                      </span>
                    </div>
                    {sensorData.color && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <Palette className="mr-2" size={16} />
                          <span>Color RGB</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full border border-slate-300"
                            style={{
                              backgroundColor: `rgb(${sensorData.color.r}, ${sensorData.color.g}, ${sensorData.color.b})`,
                            }}
                          ></div>
                          <span className="font-mono text-xs">
                            {sensorData.color.r}, {sensorData.color.g}, {sensorData.color.b}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-6">
                    <button
                      onClick={() => setShowExportPanel(!showExportPanel)}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                        darkMode
                          ? "bg-slate-700 hover:bg-slate-600 text-white"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      <Download size={16} />
                      Exportar Datos
                    </button>
                  </div>
                </motion.div>

                {/* Main Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                  className={`lg:col-span-2 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                      <BarChart2 size={18} className="mr-2" /> Tendencias Principales
                    </h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setActiveTab("environment")}
                        className={`px-2 py-1 text-xs rounded-md ${
                          darkMode ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-100 text-slate-600"
                        }`}
                      >
                        Ambiente
                      </button>
                      <button
                        onClick={() => setActiveTab("water")}
                        className={`px-2 py-1 text-xs rounded-md ${
                          darkMode ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-100 text-slate-600"
                        }`}
                      >
                        Agua
                      </button>
                    </div>
                  </div>
                  <div className="h-[300px]">
                    <Line data={getChartData("temperature")} options={getChartOptions("temperature")} />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {activeTab === "environment" && (
            <motion.div
              key="environment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Temperature Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Thermometer size={20} className={`mr-2 ${darkMode ? "text-orange-400" : "text-orange-500"}`} />{" "}
                  Temperatura
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("temperature")} options={getChartOptions("temperature")} />
                </div>
              </div>

              {/* Temperature Details */}
              <div
                className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border flex flex-col`}
              >
                <h2 className="text-xl font-semibold mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className={`text-6xl font-bold mb-2 ${darkMode ? "text-orange-400" : "text-orange-500"}`}>
                      {sensorData.temperature?.toFixed(1) ?? "--"}
                      <span className="text-2xl">°C</span>
                    </div>
                    <div className={darkMode ? "text-slate-400" : "text-slate-500"}>Temperatura Actual</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-6`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-orange-400" : "bg-orange-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${((sensorData.temperature ?? 20) - 15) * 5}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${(TEMPERATURA_OPTIMA[0] - 15) * 5}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${(TEMPERATURA_OPTIMA[1] - 15) * 5}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${darkMode ? "bg-slate-700" : "bg-slate-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-slate-400" : "text-sm text-slate-500"}>
                        Mínima Óptima
                      </div>
                      <div className={`text-xl font-semibold ${darkMode ? "text-orange-400" : "text-orange-500"}`}>
                        {TEMPERATURA_OPTIMA[0]}°C
                      </div>
                    </div>
                    <div className={`${darkMode ? "bg-slate-700" : "bg-slate-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-slate-400" : "text-sm text-slate-500"}>
                        Máxima Óptima
                      </div>
                      <div className={`text-xl font-semibold ${darkMode ? "text-orange-400" : "text-orange-500"}`}>
                        {TEMPERATURA_OPTIMA[1]}°C
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div
                      className={`p-3 rounded-lg text-center ${
                        getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-emerald-500"
                          ? darkMode
                            ? "bg-emerald-500/20 border border-emerald-500/50"
                            : "bg-emerald-50 border border-emerald-200"
                          : darkMode
                            ? "bg-red-500/20 border border-red-500/50"
                            : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <div className="font-semibold">Estado</div>
                      <div className="flex items-center justify-center mt-1">
                        {getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-emerald-500" ? (
                          <span className={darkMode ? "text-emerald-400" : "text-emerald-600"}>Óptimo</span>
                        ) : (
                          <span className={`flex items-center ${darkMode ? "text-red-400" : "text-red-600"}`}>
                            <AlertTriangle size={16} className="mr-1" />
                            {(sensorData.temperature ?? 0) < TEMPERATURA_OPTIMA[0]
                              ? "Temperatura baja"
                              : "Temperatura alta"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Humidity Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border mt-6`}
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Droplet size={20} className={`mr-2 ${darkMode ? "text-blue-400" : "text-blue-500"}`} /> Humedad del
                  Aire
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("humidity")} options={getChartOptions("humidity")} />
                </div>
              </div>

              {/* Humidity Details */}
              <div
                className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border flex flex-col mt-6`}
              >
                <h2 className="text-xl font-semibold mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className={`text-6xl font-bold mb-2 ${darkMode ? "text-blue-400" : "text-blue-500"}`}>
                      {sensorData.humidity?.toFixed(1) ?? "--"}
                      <span className="text-2xl">%</span>
                    </div>
                    <div className={darkMode ? "text-slate-400" : "text-slate-500"}>Humedad Actual</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-6`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-blue-400" : "bg-blue-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${sensorData.humidity ?? 0}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_AIRE_OPTIMA[0]}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_AIRE_OPTIMA[1]}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${darkMode ? "bg-slate-700" : "bg-slate-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-slate-400" : "text-sm text-slate-500"}>
                        Mínima Óptima
                      </div>
                      <div className={`text-xl font-semibold ${darkMode ? "text-blue-400" : "text-blue-500"}`}>
                        {HUMEDAD_AIRE_OPTIMA[0]}%
                      </div>
                    </div>
                    <div className={`${darkMode ? "bg-slate-700" : "bg-slate-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-slate-400" : "text-sm text-slate-500"}>
                        Máxima Óptima
                      </div>
                      <div className={`text-xl font-semibold ${darkMode ? "text-blue-400" : "text-blue-500"}`}>
                        {HUMEDAD_AIRE_OPTIMA[1]}%
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div
                      className={`p-3 rounded-lg text-center ${
                        getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-emerald-500"
                          ? darkMode
                            ? "bg-emerald-500/20 border border-emerald-500/50"
                            : "bg-emerald-50 border border-emerald-200"
                          : darkMode
                            ? "bg-red-500/20 border border-red-500/50"
                            : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <div className="font-semibold">Estado</div>
                      <div className="flex items-center justify-center mt-1">
                        {getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-emerald-500" ? (
                          <span className={darkMode ? "text-emerald-400" : "text-emerald-600"}>Óptimo</span>
                        ) : (
                          <span className={`flex items-center ${darkMode ? "text-red-400" : "text-red-600"}`}>
                            <AlertTriangle size={16} className="mr-1" />
                            {(sensorData.humidity ?? 0) < HUMEDAD_AIRE_OPTIMA[0] ? "Humedad baja" : "Humedad alta"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "water" && (
            <motion.div
              key="water"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Soil Moisture Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Droplet size={20} className={`mr-2 ${darkMode ? "text-emerald-400" : "text-emerald-500"}`} /> Humedad
                  del Suelo
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("soil_moisture")} options={getChartOptions("soil_moisture")} />
                </div>
              </div>

              {/* Soil Moisture Details */}
              <div
                className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border flex flex-col`}
              >
                <h2 className="text-xl font-semibold mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className={`text-6xl font-bold mb-2 ${darkMode ? "text-emerald-400" : "text-emerald-500"}`}>
                      {sensorData.soil_moisture?.toFixed(1) ?? "--"}
                      <span className="text-2xl">%</span>
                    </div>
                    <div className={darkMode ? "text-slate-400" : "text-slate-500"}>Humedad Actual</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-6`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-emerald-400" : "bg-emerald-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${sensorData.soil_moisture ?? 0}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_SUELO_OPTIMA[0]}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_SUELO_OPTIMA[1]}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${darkMode ? "bg-slate-700" : "bg-slate-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-slate-400" : "text-sm text-slate-500"}>
                        Mínimo Óptimo
                      </div>
                      <div className={`text-xl font-semibold ${darkMode ? "text-emerald-400" : "text-emerald-500"}`}>
                        {HUMEDAD_SUELO_OPTIMA[0]}%
                      </div>
                    </div>
                    <div className={`${darkMode ? "bg-slate-700" : "bg-slate-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-slate-400" : "text-sm text-slate-500"}>
                        Máximo Óptimo
                      </div>
                      <div className={`text-xl font-semibold ${darkMode ? "text-emerald-400" : "text-emerald-500"}`}>
                        {HUMEDAD_SUELO_OPTIMA[1]}%
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div
                      className={`p-3 rounded-lg text-center ${
                        getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-emerald-500"
                          ? darkMode
                            ? "bg-emerald-500/20 border border-emerald-500/50"
                            : "bg-emerald-50 border border-emerald-200"
                          : darkMode
                            ? "bg-red-500/20 border border-red-500/50"
                            : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <div className="font-semibold">Estado</div>
                      <div className="flex items-center justify-center mt-1">
                        {getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-emerald-500" ? (
                          <span className={darkMode ? "text-emerald-400" : "text-emerald-600"}>Óptimo</span>
                        ) : (
                          <span className={`flex items-center ${darkMode ? "text-red-400" : "text-red-600"}`}>
                            <AlertTriangle size={16} className="mr-1" />
                            {(sensorData.soil_moisture ?? 0) < HUMEDAD_SUELO_OPTIMA[0]
                              ? "Bajo nivel"
                              : "Nivel excesivo"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Water Level Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border mt-6`}
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Waves size={20} className={`mr-2 ${darkMode ? "text-cyan-400" : "text-cyan-500"}`} /> Nivel de Agua
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("water_level")} options={getChartOptions("water_level")} />
                </div>
              </div>

              {/* Water Quality Details */}
              <div
                className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border flex flex-col mt-6`}
              >
                <h2 className="text-xl font-semibold mb-4">Calidad del Agua</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className={`text-6xl font-bold mb-2 ${darkMode ? "text-purple-400" : "text-purple-500"}`}>
                      {sensorData.tds?.toFixed(0) ?? "--"}
                      <span className="text-2xl">ppm</span>
                    </div>
                    <div className={darkMode ? "text-slate-400" : "text-slate-500"}>TDS Actual</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-6`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-purple-400" : "bg-purple-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(((sensorData.tds ?? 0) / 1000) * 100, 100)}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-xs text-slate-400">
                    <span>0 ppm</span>
                    <span>500 ppm</span>
                    <span>1000 ppm</span>
                  </div>

                  <div className="mt-6">
                    <div className={`p-4 rounded-lg ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                      <h3 className="font-semibold mb-2">Interpretación</h3>
                      <div className="flex items-center">
                        <div
                          className={`w-3 h-3 rounded-full mr-2 ${
                            !sensorData.tds
                              ? "bg-slate-400"
                              : sensorData.tds < 50
                                ? "bg-emerald-500"
                                : sensorData.tds < 200
                                  ? "bg-green-500"
                                  : sensorData.tds < 500
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                          }`}
                        ></div>
                        <span className="font-medium">Calidad: {interpretWaterQuality(sensorData.tds)}</span>
                      </div>
                      <p className="mt-2 text-sm">
                        {!sensorData.tds
                          ? "Sin datos disponibles"
                          : sensorData.tds < 50
                            ? "Agua muy pura, ideal para plantas sensibles."
                            : sensorData.tds < 200
                              ? "Agua de buena calidad, adecuada para la mayoría de plantas."
                              : sensorData.tds < 500
                                ? "Agua con minerales moderados, monitorear según tipo de planta."
                                : "Agua con alto contenido mineral, puede afectar a plantas sensibles."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "light" && (
            <motion.div
              key="light"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {/* Light Level Card */}
              <div
                className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Sun size={20} className={`mr-2 ${darkMode ? "text-yellow-400" : "text-yellow-500"}`} /> Nivel de Luz
                </h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center my-6">
                    <div className={`text-6xl font-bold mb-2 ${darkMode ? "text-yellow-400" : "text-yellow-500"}`}>
                      {sensorData.light?.toFixed(0) ?? "--"}
                    </div>
                    <div className={darkMode ? "text-slate-400" : "text-slate-500"}>Intensidad de Luz</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-slate-700" : "bg-slate-100"} rounded-full mb-6`}>
                    <div
                      className={`absolute left-0 top-0 h-full ${darkMode ? "bg-yellow-400" : "bg-yellow-500"} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(((sensorData.light ?? 0) / 1000) * 100, 100)}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Oscuro</span>
                    <span>Medio</span>
                    <span>Brillante</span>
                  </div>

                  <div className="mt-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <h3 className="font-semibold mb-2">Interpretación</h3>
                    <p className="text-sm">
                      {!sensorData.light
                        ? "Sin datos de luz disponibles"
                        : sensorData.light < 100
                          ? "Nivel de luz muy bajo. Condiciones de poca iluminación, puede ser insuficiente para muchas plantas."
                          : sensorData.light < 300
                            ? "Nivel de luz bajo. Adecuado para plantas de sombra o que requieren poca luz."
                            : sensorData.light < 600
                              ? "Nivel de luz moderado. Iluminación adecuada para la mayoría de plantas de interior."
                              : sensorData.light < 800
                                ? "Nivel de luz alto. Buena iluminación para plantas que requieren mucha luz."
                                : "Nivel de luz muy alto. Excelente para plantas que necesitan luz solar directa."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Color Sensor Card */}
              <div
                className={`${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Palette size={20} className="mr-2" /> Sensor de Color RGB
                </h2>

                {sensorData.color ? (
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="flex justify-center mb-6">
                      <div
                        className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
                        style={{
                          backgroundColor: `rgb(${sensorData.color.r}, ${sensorData.color.g}, ${sensorData.color.b})`,
                        }}
                      ></div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className={`p-3 rounded-lg text-center ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                        <div className="text-sm text-red-500 font-semibold">Rojo</div>
                        <div className="text-xl">{sensorData.color.r}</div>
                      </div>
                      <div className={`p-3 rounded-lg text-center ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                        <div className="text-sm text-green-500 font-semibold">Verde</div>
                        <div className="text-xl">{sensorData.color.g}</div>
                      </div>
                      <div className={`p-3 rounded-lg text-center ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                        <div className="text-sm text-blue-400 font-semibold">Azul</div>
                        <div className="text-xl">{sensorData.color.b}</div>
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                      <h3 className="font-semibold mb-2">Código Hexadecimal</h3>
                      <div className="flex items-center justify-between">
                        <code
                          className={`${darkMode ? "bg-slate-900" : "bg-white"} p-2 rounded ${darkMode ? "text-white" : "text-slate-800"}`}
                        >
                          #{sensorData.color.r.toString(16).padStart(2, "0")}
                          {sensorData.color.g.toString(16).padStart(2, "0")}
                          {sensorData.color.b.toString(16).padStart(2, "0")}
                        </code>
                        <button
                          className={`px-3 py-1 rounded-md ${
                            darkMode
                              ? "bg-slate-600 hover:bg-slate-500 text-white"
                              : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                          }`}
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `#${sensorData.color.r.toString(16).padStart(2, "0")}${sensorData.color.g
                                .toString(16)
                                .padStart(2, "0")}${sensorData.color.b.toString(16).padStart(2, "0")}`,
                            )
                          }}
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center items-center h-64">
                    <p className="text-slate-400">No hay datos de color disponibles</p>
                  </div>
                )}
              </div>

              {/* System Info */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm"} rounded-lg p-4 border mt-6`}
              >
                <div className="flex items-center mb-4">
                  <Info size={20} className="mr-2" />
                  <h2 className="text-xl font-semibold">Información del Sistema</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className={`p-4 rounded-lg ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Estado de Conexión</h3>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full ${getStatusIndicator()} mr-2 animate-pulse`}></div>
                      <span>{isConnected ? "Conectado" : "Desconectado"}</span>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Última Actualización</h3>
                    <div>{formatLastUpdate()}</div>
                  </div>

                  <div className={`p-4 rounded-lg ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Datos Recopilados</h3>
                    <div>{dataLogRef.current.length} registros</div>
                  </div>

                  <div className={`p-4 rounded-lg ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Broker MQTT</h3>
                    <div className="text-xs truncate">{MQTT_BROKER}</div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => setShowExportPanel(!showExportPanel)}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                      darkMode
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-emerald-500 hover:bg-emerald-600 text-white"
                    }`}
                  >
                    <Download size={16} />
                    Exportar Datos
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

