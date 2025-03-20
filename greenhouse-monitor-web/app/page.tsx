"use client"

import React, { useEffect, useState } from "react"
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
} from "chart.js"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

// Constants
const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt"
const MQTT_TOPIC = "sensor/humedad"
const TIEMPO_MAX = 30
const HUMEDAD_OPTIMA: [number, number] = [20, 60]

interface SensorData {
  temperatura?: number
  humedad?: number
  co2?: number
  voc?: number
  turbidez?: number
  calidad_agua?: string
}

export default function GreenhouseMonitor() {
  const [sensorData, setSensorData] = useState<SensorData>({})
  const [humidityHistory, setHumidityHistory] = useState<number[]>([])
  const [timeHistory, setTimeHistory] = useState<number[]>([])
  const [status, setStatus] = useState("Esperando conexión...")

  useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER)

    client.on("connect", () => {
      setStatus("Conectado a MQTT")
      client.subscribe(MQTT_TOPIC)
    })

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString())
        setSensorData((prev) => ({ ...prev, ...data }))

        if (typeof data.humedad === "number") {
          setHumidityHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), data.humedad as number])
          setTimeHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), prev.length])
        }
      } catch (error) {
        setStatus("Error al procesar datos")
      }
    })

    return () => {
      client.end()
    }
  }, [])

  const chartData = {
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

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: {
          color: "#333333",
        },
        ticks: {
          color: "#00FF00",
        },
      },
      x: {
        grid: {
          color: "#333333",
        },
        ticks: {
          color: "#00FF00",
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: "#00FF00",
        },
      },
    },
  }
  
  return (
    <div style={{ backgroundColor: "black", color: "#00FF00", minHeight: "100vh", padding: "1rem" }}>
      <h1 style={{ fontSize: "1.875rem", marginBottom: "1.5rem" }}>Monitor de Sensores del Invernadero</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Lecturas de Sensores</h2>
          <div style={{ backgroundColor: "#0F1A2A", padding: "1rem", borderRadius: "0.25rem", border: "1px solid #00FF00" }}>
            <p style={{ marginBottom: "0.5rem" }}>Temperatura: {sensorData.temperatura ?? "--"} °C</p>
            <p style={{ marginBottom: "0.5rem" }}>Humedad Aire: {sensorData.humedad ?? "--"}%</p>
            <p style={{ marginBottom: "0.5rem" }}>CO₂: {sensorData.co2 ?? "--"} ppm</p>
            <p style={{ marginBottom: "0.5rem" }}>VOC: {sensorData.voc ?? "--"}</p>
            <p style={{ marginBottom: "0.5rem", color: (sensorData.humedad ?? 0) >= HUMEDAD_OPTIMA[0] && (sensorData.humedad ?? 0) <= HUMEDAD_OPTIMA[1] ? "#00FF00" : "#FF0000" }}>
              Humedad Suelo: {sensorData.humedad ?? "--"}%
            </p>
            <p style={{ marginBottom: "0.5rem" }}>Turbidez: {sensorData.turbidez ?? "--"} NTU</p>
            <p>Calidad del Agua: {sensorData.calidad_agua ?? "--"}</p>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Humedad del Suelo</h2>
          <div style={{ backgroundColor: "#0F1A2A", padding: "1rem", borderRadius: "0.25rem", border: "1px solid #00FF00" }}>
            <div style={{ height: "350px", marginBottom: "1rem" }}>
              <Line data={chartData} options={chartOptions} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Mínimo Óptimo</p>
                <p style={{ fontSize: "1.125rem", color: "#00FF00" }}>{HUMEDAD_OPTIMA[0]}%</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Actual</p>
                <p style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#00FF00" }}>{sensorData.humedad?.toFixed(1) ?? "--"}%</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Máximo Óptimo</p>
                <p style={{ fontSize: "1.125rem", color: "#00FF00" }}>{HUMEDAD_OPTIMA[1]}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, backgroundColor: "#0F1A2A", color: "#00FF00", padding: "0.5rem" }}>
        Status: {status}
      </div>
    </div>
  )
}