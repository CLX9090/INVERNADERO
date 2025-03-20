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
import { Thermometer, Droplet, Wind, Activity, BarChart2, AlertTriangle, Menu, X, RefreshCw } from "lucide-react"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

// Constants
const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt"
const MQTT_TOPIC = "sensor/humedad"
const TIEMPO_MAX = 30
const HUMEDAD_OPTIMA: [number, number] = [20, 60]
const PH_OPTIMO: [number, number] = [5.5, 6.5]

interface SensorData {
  temperatura?: number
  humedad?: number
  co2?: number
  voc?: number
  bateria?: number
  ph?: number
  turbidez?: number
  calidad_agua?: string
}

export default function GreenhouseMonitor() {
  const [sensorData, setSensorData] = useState<SensorData>({})
  const [humidityHistory, setHumidityHistory] = useState<number[]>([])
  const [temperatureHistory, setTemperatureHistory] = useState<number[]>([])
  const [timeHistory, setTimeHistory] = useState<number[]>([])
  const [status, setStatus] = useState("Esperando conexión...")
  const [isConnected, setIsConnected] = useState(false)
  const [activeTab, setActiveTab] = useState("humidity")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const clientRef = useRef<mqtt.MqttClient | null>(null)

  useEffect(() => {
    setIsLoading(true)

    try {
      clientRef.current = mqtt.connect(MQTT_BROKER)

      clientRef.current.on("connect", () => {
        setStatus("Conectado a MQTT")
        setIsConnected(true)
        clientRef.current?.subscribe(MQTT_TOPIC)
      })

      clientRef.current.on("message", (topic, message) => {
        try {
          const data = JSON.parse(message.toString())
          setSensorData((prev) => ({ ...prev, ...data }))
          setLastUpdate(new Date())

          if (typeof data.humedad === "number") {
            setHumidityHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), data.humedad])
            setTimeHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), prev.length])
          }

          if (typeof data.temperatura === "number") {
            setTemperatureHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), data.temperatura])
          }
        } catch (error) {
          setStatus("Error al procesar datos")
        }
      })

      clientRef.current.on("error", (err) => {
        setStatus(`Error de conexión: ${err.message}`)
        setIsConnected(false)
      })

      clientRef.current.on("offline", () => {
        setStatus("Desconectado del broker MQTT")
        setIsConnected(false)
      })
    } catch (error) {
      setStatus("Error al inicializar conexión MQTT")
      setIsConnected(false)
    }

    // Simular datos para la vista previa
    if (process.env.NODE_ENV === "development") {
      const interval = setInterval(() => {
        const mockData: SensorData = {
          temperatura: 25 + Math.random() * 5,
          humedad: 40 + Math.random() * 30,
          co2: 400 + Math.random() * 200,
          voc: 2 + Math.random() * 2,
          bateria: 11.5 + Math.random() * 1,
          ph: 6 + Math.random() * 1.5 - 0.5,
          turbidez: 5 + Math.random() * 15,
          calidad_agua: ["Excelente", "Buena", "Regular", "Deficiente"][Math.floor(Math.random() * 4)],
        }

        setSensorData(mockData)
        setHumidityHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), mockData.humedad as number])
        setTemperatureHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), mockData.temperatura as number])
        setTimeHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), prev.length])
        setLastUpdate(new Date())
        setIsConnected(true)
        setStatus("Conectado a MQTT (simulación)")
      }, 3000)

      return () => clearInterval(interval)
    }

    setTimeout(() => {
      setIsLoading(false)
    }, 1500)

    return () => {
      clientRef.current?.end()
    }
  }, [])

  const humidityChartData = {
    labels: timeHistory,
    datasets: [
      {
        label: "Humedad del Suelo",
        data: humidityHistory,
        borderColor: "#00FF00",
        backgroundColor: "rgba(0, 255, 0, 0.2)",
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: "#00FF00",
        fill: true,
      },
    ],
  }

  const temperatureChartData = {
    labels: timeHistory,
    datasets: [
      {
        label: "Temperatura",
        data: temperatureHistory,
        borderColor: "#FF9900",
        backgroundColor: "rgba(255, 153, 0, 0.2)",
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: "#FF9900",
        fill: true,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      easing: "easeOutQuart",
    },
    scales: {
      y: {
        min: activeTab === "humidity" ? 0 : 15,
        max: activeTab === "humidity" ? 100 : 35,
        grid: {
          color: "rgba(255, 255, 255, 0.1)",
        },
        ticks: {
          color: "#00FF00",
          font: {
            family: "Consolas, monospace",
          },
        },
        title: {
          display: true,
          text: activeTab === "humidity" ? "Humedad (%)" : "Temperatura (°C)",
          color: "#00FF00",
          font: {
            family: "Consolas, monospace",
          },
        },
      },
      x: {
        grid: {
          color: "rgba(255, 255, 255, 0.1)",
        },
        ticks: {
          color: "#00FF00",
          font: {
            family: "Consolas, monospace",
          },
        },
        title: {
          display: true,
          text: "Tiempo",
          color: "#00FF00",
          font: {
            family: "Consolas, monospace",
          },
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: "#00FF00",
          font: {
            family: "Consolas, monospace",
          },
        },
      },
    },
  }

  const getValueColor = (value: number | undefined, [min, max]: number[]) => {
    if (value === undefined) return "text-gray-400"
    return value >= min && value <= max ? "text-green-500" : "text-red-500"
  }

  const getStatusIndicator = () => {
    if (isConnected) {
      return "bg-green-500"
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
    clientRef.current?.end()

    setTimeout(() => {
      clientRef.current = mqtt.connect(MQTT_BROKER)
      clientRef.current.on("connect", () => {
        setStatus("Conectado a MQTT")
        setIsConnected(true)
        clientRef.current?.subscribe(MQTT_TOPIC)
      })
    }, 1000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
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
              <RefreshCw size={48} className="text-green-500" />
            </motion.div>
            <h1 className="text-2xl font-mono text-green-500 mb-2">Invernadero Monitor</h1>
            <p className="text-green-500">Iniciando sistema...</p>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-green-500">
      {/* Header */}
      <header className="bg-gray-900 border-b border-green-500/30 p-4 sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="text-xl md:text-2xl font-mono font-bold flex items-center"
          >
            <span className="mr-2">🌱</span> Invernadero Monitor
          </motion.h1>

          <div className="hidden md:flex space-x-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-md transition-colors ${activeTab === "humidity" ? "bg-green-500/20 border border-green-500" : "hover:bg-gray-800"}`}
              onClick={() => setActiveTab("humidity")}
            >
              Humedad
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-md transition-colors ${activeTab === "temperature" ? "bg-green-500/20 border border-green-500" : "hover:bg-gray-800"}`}
              onClick={() => setActiveTab("temperature")}
            >
              Temperatura
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-md transition-colors ${activeTab === "all" ? "bg-green-500/20 border border-green-500" : "hover:bg-gray-800"}`}
              onClick={() => setActiveTab("all")}
            >
              Todos los Sensores
            </motion.button>
          </div>

          <div className="md:hidden">
            <button onClick={toggleMobileMenu} className="text-green-500 p-2">
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-900 border-b border-green-500/30 md:hidden"
          >
            <div className="container mx-auto py-2 px-4 flex flex-col space-y-2">
              <button
                className={`p-2 rounded-md text-left ${activeTab === "humidity" ? "bg-green-500/20 border border-green-500" : ""}`}
                onClick={() => {
                  setActiveTab("humidity")
                  setIsMobileMenuOpen(false)
                }}
              >
                Humedad
              </button>
              <button
                className={`p-2 rounded-md text-left ${activeTab === "temperature" ? "bg-green-500/20 border border-green-500" : ""}`}
                onClick={() => {
                  setActiveTab("temperature")
                  setIsMobileMenuOpen(false)
                }}
              >
                Temperatura
              </button>
              <button
                className={`p-2 rounded-md text-left ${activeTab === "all" ? "bg-green-500/20 border border-green-500" : ""}`}
                onClick={() => {
                  setActiveTab("all")
                  setIsMobileMenuOpen(false)
                }}
              >
                Todos los Sensores
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
          className="mb-6 bg-gray-900 rounded-lg p-4 border border-green-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        >
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${getStatusIndicator()} mr-2 animate-pulse`}></div>
            <span>{status}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-400">Última actualización: {formatLastUpdate()}</div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={reconnect}
              className="bg-green-500/20 hover:bg-green-500/30 border border-green-500 rounded-md px-3 py-1 text-sm flex items-center"
            >
              <RefreshCw size={14} className="mr-1" /> Reconectar
            </motion.button>
          </div>
        </motion.div>

        {/* Content based on active tab */}
        <AnimatePresence mode="wait">
          {activeTab === "humidity" && (
            <motion.div
              key="humidity"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Humidity Chart */}
              <div className="lg:col-span-2 bg-gray-900 rounded-lg p-4 border border-green-500/30">
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Droplet size={20} className="mr-2" /> Humedad del Suelo
                </h2>
                <div className="h-[350px]">
                  <Line data={humidityChartData} options={chartOptions} />
                </div>
              </div>

              {/* Humidity Details */}
              <div className="bg-gray-900 rounded-lg p-4 border border-green-500/30 flex flex-col">
                <h2 className="text-xl font-mono mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className="text-6xl font-bold mb-2">
                      <span className={getValueColor(sensorData.humedad, HUMEDAD_OPTIMA)}>
                        {sensorData.humedad?.toFixed(1) ?? "--"}
                      </span>
                      <span className="text-2xl">%</span>
                    </div>
                    <div className="text-gray-400">Humedad Actual</div>
                  </div>

                  <div className="relative h-4 bg-gray-800 rounded-full mb-6">
                    <div
                      className="absolute left-0 top-0 h-full bg-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${sensorData.humedad ?? 0}%` }}
                    ></div>
                    <div className="absolute h-full w-px bg-yellow-500" style={{ left: `${HUMEDAD_OPTIMA[0]}%` }}></div>
                    <div className="absolute h-full w-px bg-yellow-500" style={{ left: `${HUMEDAD_OPTIMA[1]}%` }}></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800 p-3 rounded-lg text-center">
                      <div className="text-sm text-gray-400">Mínimo Óptimo</div>
                      <div className="text-xl font-semibold">{HUMEDAD_OPTIMA[0]}%</div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded-lg text-center">
                      <div className="text-sm text-gray-400">Máximo Óptimo</div>
                      <div className="text-xl font-semibold">{HUMEDAD_OPTIMA[1]}%</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div
                      className={`p-3 rounded-lg text-center ${getValueColor(sensorData.humedad, HUMEDAD_OPTIMA) === "text-green-500" ? "bg-green-500/20 border border-green-500" : "bg-red-500/20 border border-red-500"}`}
                    >
                      <div className="font-semibold">Estado</div>
                      <div className="flex items-center justify-center mt-1">
                        {getValueColor(sensorData.humedad, HUMEDAD_OPTIMA) === "text-green-500" ? (
                          <span>Óptimo</span>
                        ) : (
                          <span className="flex items-center">
                            <AlertTriangle size={16} className="mr-1" />
                            {(sensorData.humedad ?? 0) < HUMEDAD_OPTIMA[0] ? "Bajo nivel" : "Nivel excesivo"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "temperature" && (
            <motion.div
              key="temperature"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Temperature Chart */}
              <div className="lg:col-span-2 bg-gray-900 rounded-lg p-4 border border-green-500/30">
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Thermometer size={20} className="mr-2" /> Temperatura
                </h2>
                <div className="h-[350px]">
                  <Line data={temperatureChartData} options={chartOptions} />
                </div>
              </div>

              {/* Temperature Details */}
              <div className="bg-gray-900 rounded-lg p-4 border border-green-500/30 flex flex-col">
                <h2 className="text-xl font-mono mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className="text-6xl font-bold mb-2 text-orange-400">
                      {sensorData.temperatura?.toFixed(1) ?? "--"}
                      <span className="text-2xl">°C</span>
                    </div>
                    <div className="text-gray-400">Temperatura Actual</div>
                  </div>

                  <div className="relative h-4 bg-gray-800 rounded-full mb-6">
                    <div
                      className="absolute left-0 top-0 h-full bg-orange-400 rounded-full transition-all duration-500"
                      style={{ width: `${((sensorData.temperatura ?? 20) - 15) * 5}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800 p-3 rounded-lg text-center">
                      <div className="text-sm text-gray-400">Mínima Registrada</div>
                      <div className="text-xl font-semibold text-orange-400">
                        {Math.min(...temperatureHistory.filter((t) => t > 0), sensorData.temperatura ?? 100).toFixed(1)}
                        °C
                      </div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded-lg text-center">
                      <div className="text-sm text-gray-400">Máxima Registrada</div>
                      <div className="text-xl font-semibold text-orange-400">
                        {Math.max(...temperatureHistory, sensorData.temperatura ?? 0).toFixed(1)}°C
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="p-3 rounded-lg text-center bg-gray-800">
                      <div className="font-semibold">Variación</div>
                      <div className="flex items-center justify-center mt-1">
                        {temperatureHistory.length > 1 ? (
                          <span className="text-orange-400">
                            {(sensorData.temperatura ?? 0) - temperatureHistory[temperatureHistory.length - 2] > 0
                              ? "+"
                              : ""}
                            {(
                              (sensorData.temperatura ?? 0) - temperatureHistory[temperatureHistory.length - 2]
                            ).toFixed(2)}
                            °C
                          </span>
                        ) : (
                          <span>--</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "all" && (
            <motion.div
              key="all"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Humidity Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="bg-gray-900 rounded-lg p-4 border border-green-500/30"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-mono flex items-center">
                      <Droplet size={18} className="mr-2" /> Humedad del Suelo
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${getValueColor(sensorData.humedad, HUMEDAD_OPTIMA) === "text-green-500" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}
                    >
                      {getValueColor(sensorData.humedad, HUMEDAD_OPTIMA) === "text-green-500" ? "Óptimo" : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span className={`text-4xl font-bold ${getValueColor(sensorData.humedad, HUMEDAD_OPTIMA)}`}>
                      {sensorData.humedad?.toFixed(1) ?? "--"}%
                    </span>
                  </div>
                  <div className="relative h-2 bg-gray-800 rounded-full mb-2">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${getValueColor(sensorData.humedad, HUMEDAD_OPTIMA) === "text-green-500" ? "bg-green-500" : "bg-red-500"}`}
                      style={{ width: `${sensorData.humedad ?? 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </motion.div>

                {/* Temperature Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  className="bg-gray-900 rounded-lg p-4 border border-green-500/30"
                >
                  <h3 className="text-lg font-mono mb-4 flex items-center">
                    <Thermometer size={18} className="mr-2" /> Temperatura
                  </h3>
                  <div className="text-center my-4">
                    <span className="text-4xl font-bold text-orange-400">
                      {sensorData.temperatura?.toFixed(1) ?? "--"}°C
                    </span>
                  </div>
                  <div className="relative h-2 bg-gray-800 rounded-full mb-2">
                    <div
                      className="absolute left-0 top-0 h-full bg-orange-400 rounded-full transition-all duration-500"
                      style={{ width: `${((sensorData.temperatura ?? 20) - 15) * 5}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>15°C</span>
                    <span>25°C</span>
                    <span>35°C</span>
                  </div>
                </motion.div>

                {/* CO2 Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className="bg-gray-900 rounded-lg p-4 border border-green-500/30"
                >
                  <h3 className="text-lg font-mono mb-4 flex items-center">
                    <Wind size={18} className="mr-2" /> CO₂
                  </h3>
                  <div className="text-center my-4">
                    <span className="text-4xl font-bold text-blue-400">{sensorData.co2?.toFixed(0) ?? "--"} ppm</span>
                  </div>
                  <div className="relative h-2 bg-gray-800 rounded-full mb-2">
                    <div
                      className="absolute left-0 top-0 h-full bg-blue-400 rounded-full transition-all duration-500"
                      style={{ width: `${((sensorData.co2 ?? 400) - 300) / 10}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>300 ppm</span>
                    <span>800 ppm</span>
                    <span>1300 ppm</span>
                  </div>
                </motion.div>

                {/* VOC Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                  className="bg-gray-900 rounded-lg p-4 border border-green-500/30"
                >
                  <h3 className="text-lg font-mono mb-4 flex items-center">
                    <Activity size={18} className="mr-2" /> VOC
                  </h3>
                  <div className="text-center my-4">
                    <span className="text-4xl font-bold text-purple-400">{sensorData.voc?.toFixed(2) ?? "--"}</span>
                  </div>
                  <div className="relative h-2 bg-gray-800 rounded-full mb-2">
                    <div
                      className="absolute left-0 top-0 h-full bg-purple-400 rounded-full transition-all duration-500"
                      style={{ width: `${(sensorData.voc ?? 0) * 20}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0</span>
                    <span>2.5</span>
                    <span>5.0</span>
                  </div>
                </motion.div>

                {/* pH Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                  className="bg-gray-900 rounded-lg p-4 border border-green-500/30"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-mono flex items-center">
                      <BarChart2 size={18} className="mr-2" /> pH
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${getValueColor(sensorData.ph, PH_OPTIMO) === "text-green-500" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}
                    >
                      {getValueColor(sensorData.ph, PH_OPTIMO) === "text-green-500" ? "Óptimo" : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span className={`text-4xl font-bold ${getValueColor(sensorData.ph, PH_OPTIMO)}`}>
                      {sensorData.ph?.toFixed(2) ?? "--"}
                    </span>
                  </div>
                  <div className="relative h-2 bg-gray-800 rounded-full mb-2">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${getValueColor(sensorData.ph, PH_OPTIMO) === "text-green-500" ? "bg-green-500" : "bg-red-500"}`}
                      style={{ width: `${(sensorData.ph ?? 0) * 7.14}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0</span>
                    <span>7</span>
                    <span>14</span>
                  </div>
                </motion.div>

                {/* Water Quality Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                  className="bg-gray-900 rounded-lg p-4 border border-green-500/30"
                >
                  <h3 className="text-lg font-mono mb-4 flex items-center">
                    <Droplet size={18} className="mr-2" /> Calidad del Agua
                  </h3>
                  <div className="flex flex-col items-center justify-center h-32">
                    <div className="text-2xl font-bold mb-2">{sensorData.calidad_agua ?? "--"}</div>
                    <div className="text-sm text-gray-400">Turbidez: {sensorData.turbidez?.toFixed(1) ?? "--"} NTU</div>
                    <div className="w-full mt-4">
                      <div className="grid grid-cols-4 gap-1">
                        <div
                          className={`h-2 rounded-full ${sensorData.calidad_agua === "Excelente" ? "bg-green-500" : "bg-gray-700"}`}
                        ></div>
                        <div
                          className={`h-2 rounded-full ${sensorData.calidad_agua === "Buena" ? "bg-green-500" : "bg-gray-700"}`}
                        ></div>
                        <div
                          className={`h-2 rounded-full ${sensorData.calidad_agua === "Regular" ? "bg-yellow-500" : "bg-gray-700"}`}
                        ></div>
                        <div
                          className={`h-2 rounded-full ${sensorData.calidad_agua === "Deficiente" ? "bg-red-500" : "bg-gray-700"}`}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>Excelente</span>
                        <span>Buena</span>
                        <span>Regular</span>
                        <span>Deficiente</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

