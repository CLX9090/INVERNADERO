import tkinter as tk
from tkinter import ttk
import paho.mqtt.client as mqtt
import json
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.animation import FuncAnimation
from collections import deque
import seaborn as sns
from typing import Dict, Any
import time
import threading

# 🎨 Configuración de estilo gráfico
sns.set_style("darkgrid")
plt.rcParams.update({
    "font.family": "Consolas",
    "axes.facecolor": "#000000",
    "axes.edgecolor": "#FFFFFF",
    "xtick.color": "#FFFFFF",
    "ytick.color": "#FFFFFF",
    "grid.color": "#555555",
    "text.color": "#FFFFFF",
})

# 📡 Configuración MQTT
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_TOPIC = "sensor/humedad"

# 📊 Parámetros óptimos para el invernadero
TIEMPO_MAX = 30  # Máximo de puntos en el gráfico
PH_OPTIMO = (5.5, 6.5)
HUMEDAD_OPTIMA = (20, 60)

class ClienteMQTT:
    def __init__(self, on_message_callback):
        self.cliente = mqtt.Client()
        self.cliente.on_connect = self.on_connect
        self.cliente.on_message = self.on_message
        self.on_message_callback = on_message_callback

    def conectar(self):
        self.cliente.connect(MQTT_BROKER, MQTT_PORT, 60)
        self.cliente.loop_start()

    def on_connect(self, client, userdata, flags, rc):
        print(f"Conectado con código de resultado {rc}")
        client.subscribe(MQTT_TOPIC)

    def on_message(self, client, userdata, msg):
        try:
            datos = json.loads(msg.payload.decode())
            self.on_message_callback(datos)
        except json.JSONDecodeError:
            print("Error al decodificar JSON")
        except Exception as e:
            print(f"Error al procesar los datos: {str(e)}")

class MonitorSensores:
    def __init__(self, ventana):
        self.ventana = ventana
        self.ventana.title("Monitor de Sensores del Invernadero")
        self.ventana.configure(bg="#000000")
        self.ventana.state("zoomed")

        self.datos_sensores = {
            "Temperatura": "-- °C",
            "Humedad Aire": "--%",
            "CO₂": "-- ppm",
            "VOC": "--",
            "Batería": "--V",
            "Humedad Suelo": "--%",
            "pH": "--",
            "Turbidez": "-- NTU",
            "Calidad del Agua": "--",
            "Tiempo": "--:--"
        }

        self.tiempo = deque(maxlen=TIEMPO_MAX)
        self.humedad_suelo = deque(maxlen=TIEMPO_MAX)
        self.contador_tiempo = 0

        self.configurar_interfaz()
        self.cliente_mqtt = ClienteMQTT(self.actualizar_datos)
        self.cliente_mqtt.conectar()

        self.iniciar_actualizacion_periodica()

    def configurar_interfaz(self):
        self.configurar_estilo()
        self.crear_marco_principal()
        self.crear_seccion_sensores()
        self.crear_grafico()
        self.crear_barra_estado()

    def configurar_estilo(self):
        estilo = ttk.Style()
        estilo.theme_use("clam")
        estilo.configure("TLabel", background="#000000", foreground="#00FF00", font=("Consolas", 12))
        estilo.configure("TFrame", background="#000000")

    def crear_marco_principal(self):
        self.marco_principal = ttk.Frame(self.ventana, padding="20", style="TFrame")
        self.marco_principal.pack(fill=tk.BOTH, expand=True)

    def crear_seccion_sensores(self):
        marco_sensores = ttk.Frame(self.marco_principal, style="TFrame")
        marco_sensores.pack(fill=tk.X)

        self.etiquetas = {}
        for i, (nombre, valor) in enumerate(self.datos_sensores.items()):
            ttk.Label(marco_sensores, text=f"{nombre}:", style="TLabel").grid(row=i, column=0, padx=10, sticky="w")
            etiqueta = ttk.Label(marco_sensores, text=valor, style="TLabel")
            etiqueta.grid(row=i, column=1, padx=10, sticky="w")
            self.etiquetas[nombre] = etiqueta

    def crear_grafico(self):
        self.figura, self.ejes_humedad = plt.subplots(figsize=(8, 5))
        self.figura.patch.set_facecolor("#000000")

        lienzo = FigureCanvasTkAgg(self.figura, master=self.marco_principal)
        lienzo.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        self.animacion = FuncAnimation(self.figura, self.actualizar_grafico, interval=1000)

    def crear_barra_estado(self):
        self.barra_estado = ttk.Label(self.ventana, text="Esperando datos...", background="#222", foreground="#00FF00", anchor="w")
        self.barra_estado.pack(side=tk.BOTTOM, fill=tk.X)

    def actualizar_datos(self, datos: Dict[str, Any]):
        self.contador_tiempo += 1
        self.tiempo.append(self.contador_tiempo)

        if "humedad" in datos and isinstance(datos["humedad"], (int, float)):
            self.humedad_suelo.append(datos["humedad"])
            self.actualizar_etiqueta("Humedad Suelo", f"{datos['humedad']}%", self.evaluar_color(datos["humedad"], *HUMEDAD_OPTIMA))

        if "ph" in datos:
            self.actualizar_etiqueta("pH", f"{datos['ph']}", self.evaluar_color(datos["ph"], *PH_OPTIMO))

        for campo in ["temperatura", "co2", "voc", "bateria", "turbidez", "calidad_agua"]:
            if campo in datos:
                self.actualizar_etiqueta(campo.capitalize(), f"{datos[campo]}")

        self.actualizar_etiqueta("Tiempo", f"{self.contador_tiempo//60}:{self.contador_tiempo%60:02d}")

    def actualizar_etiqueta(self, nombre: str, valor: str, color: str = "#00FF00"):
        if nombre in self.etiquetas:
            self.etiquetas[nombre].config(text=valor, foreground=color)

    def evaluar_color(self, valor: float, minimo: float, maximo: float) -> str:
        return "#00FF00" if minimo <= valor <= maximo else "#FF0000"

    def actualizar_grafico(self, frame):
        self.ejes_humedad.clear()
        self.ejes_humedad.plot(list(self.tiempo), list(self.humedad_suelo), color="#00FF00", linewidth=2, marker="o", markersize=5)
        self.ejes_humedad.axhline(HUMEDAD_OPTIMA[0], color='red', linestyle='--', label='Límite Inferior')
        self.ejes_humedad.axhline(HUMEDAD_OPTIMA[1], color='blue', linestyle='--', label='Límite Superior')
        self.ejes_humedad.set_title("📊 Humedad del Suelo", fontsize=14)
        self.ejes_humedad.set_ylim(0, 100)
        self.ejes_humedad.legend()
        self.figura.canvas.draw()

    def iniciar_actualizacion_periodica(self):
        def actualizar():
            while True:
                self.ventana.event_generate("<<ActualizarUI>>", when="tail")
                time.sleep(1)

        self.ventana.bind("<<ActualizarUI>>", lambda e: self.ventana.update_idletasks())
        threading.Thread(target=actualizar, daemon=True).start()

if __name__ == "__main__":
    ventana = tk.Tk()
    monitor = MonitorSensores(ventana)
    ventana.mainloop()

