/**
 * Greenhouse Monitor - ESP32 Sensor Data Sender
 * 
 * Este programa lee datos de sensores (o los simula) y los envía a un broker MQTT
 * para ser visualizados en aplicaciones web o de escritorio.
 * 
 * Autor: v0
 * Fecha: 2023
 */

 #include <WiFi.h>
 #include <PubSubClient.h>
 #include <ArduinoJson.h>
 #include <DHT.h>
 
 // ==================== CONFIGURACIÓN ====================
 
 // WiFi
 const char* WIFI_SSID = "TU_SSID_WIFI";
 const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";
 
 // MQTT
 const char* MQTT_SERVER = "broker.hivemq.com";
 const int MQTT_PORT = 1883;
 const char* MQTT_TOPIC = "sensor/humedad";
 const char* MQTT_CLIENT_ID = "ESP32_Greenhouse";
 
 // Pines de sensores
 #define PIN_DHT 4          // Sensor DHT22 (temperatura y humedad)
 #define PIN_HUMEDAD_SUELO 36 // Sensor de humedad del suelo
 #define PIN_PH 34          // Sensor de pH
 #define PIN_TURBIDEZ 35    // Sensor de turbidez
 #define PIN_CO2 32         // Sensor de CO2
 #define PIN_VOC 33         // Sensor de VOC
 #define PIN_BATERIA 25     // Monitoreo de batería
 
 // Tipo de sensor DHT (DHT11, DHT22, etc.)
 #define DHTTYPE DHT22
 
 // Intervalos (en milisegundos)
 const unsigned long INTERVALO_LECTURA = 5000;  // 5 segundos
 const unsigned long INTERVALO_ENVIO = 10000;   // 10 segundos
 
 // Parámetros óptimos
 const float PH_OPTIMO_MIN = 5.5;
 const float PH_OPTIMO_MAX = 6.5;
 const float HUMEDAD_OPTIMA_MIN = 20.0;
 const float HUMEDAD_OPTIMA_MAX = 60.0;
 
 // ==================== VARIABLES GLOBALES ====================
 
 // Objetos para WiFi, MQTT y sensores
 WiFiClient espClient;
 PubSubClient mqttClient(espClient);
 DHT dht(PIN_DHT, DHTTYPE);
 
 // Variables para almacenar datos de sensores
 struct SensorData {
   float temperatura;
   float humedad;
   float co2;
   float voc;
   float bateria;
   float ph;
   float turbidez;
   String calidad_agua;
 } sensorData;
 
 // Variables para control de tiempo
 unsigned long ultimaLectura = 0;
 unsigned long ultimoEnvio = 0;
 
 // Indicador de modo de simulación
 bool modoSimulacion = true;
 
 // ==================== FUNCIONES ====================
 
 /**
  * Configura la conexión WiFi
  */
 void setupWiFi() {
   delay(10);
   Serial.println();
   Serial.print("Conectando a ");
   Serial.println(WIFI_SSID);
 
   WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
 
   while (WiFi.status() != WL_CONNECTED) {
     delay(500);
     Serial.print(".");
   }
 
   Serial.println("");
   Serial.println("WiFi conectado");
   Serial.println("Dirección IP: ");
   Serial.println(WiFi.localIP());
 }
 
 /**
  * Reconecta al servidor MQTT si la conexión se pierde
  */
 void reconnectMQTT() {
   while (!mqttClient.connected()) {
     Serial.print("Intentando conexión MQTT...");
     
     if (mqttClient.connect(MQTT_CLIENT_ID)) {
       Serial.println("conectado");
     } else {
       Serial.print("falló, rc=");
       Serial.print(mqttClient.state());
       Serial.println(" intentando de nuevo en 5 segundos");
       delay(5000);
     }
   }
 }
 
 /**
  * Inicializa los valores de los sensores
  */
 void inicializarSensores() {
   sensorData.temperatura = 25.0;
   sensorData.humedad = 40.0;
   sensorData.co2 = 400.0;
   sensorData.voc = 2.5;
   sensorData.bateria = 12.0;
   sensorData.ph = 6.0;
   sensorData.turbidez = 10.0;
   sensorData.calidad_agua = "Buena";
   
   // Iniciar el sensor DHT
   dht.begin();
 }
 
 /**
  * Lee los datos de los sensores (o los simula)
  */
 void leerSensores() {
   if (modoSimulacion) {
     // Modo simulación: generar datos aleatorios con pequeñas variaciones
     sensorData.temperatura = random(2300, 2800) / 100.0;  // 23.00 - 28.00 °C
     sensorData.humedad = random(3000, 7000) / 100.0;      // 30.00 - 70.00 %
     sensorData.co2 = random(350, 800);                    // 350 - 800 ppm
     sensorData.voc = random(150, 350) / 100.0;            // 1.50 - 3.50
     sensorData.bateria = random(1150, 1250) / 100.0;      // 11.50 - 12.50 V
     sensorData.ph = random(500, 700) / 100.0;             // 5.00 - 7.00
     sensorData.turbidez = random(500, 2000) / 100.0;      // 5.00 - 20.00 NTU
   } else {
     // Modo real: leer sensores físicos
     
     // Leer temperatura y humedad del DHT
     float h = dht.readHumidity();
     float t = dht.readTemperature();
     
     if (!isnan(h) && !isnan(t)) {
       sensorData.humedad = h;
       sensorData.temperatura = t;
     }
     
     // Leer sensor de humedad del suelo
     int valorHumedadSuelo = analogRead(PIN_HUMEDAD_SUELO);
     sensorData.humedad = map(valorHumedadSuelo, 4095, 0, 0, 10000) / 100.0; // 0-100%
     
     // Leer sensor de pH
     int valorPH = analogRead(PIN_PH);
     sensorData.ph = map(valorPH, 0, 4095, 0, 1400) / 100.0; // 0-14 pH
     
     // Leer sensor de turbidez
     int valorTurbidez = analogRead(PIN_TURBIDEZ);
     sensorData.turbidez = map(valorTurbidez, 0, 4095, 0, 10000) / 100.0; // 0-100 NTU
     
     // Leer sensor de CO2
     int valorCO2 = analogRead(PIN_CO2);
     sensorData.co2 = map(valorCO2, 0, 4095, 400, 5000); // 400-5000 ppm
     
     // Leer sensor de VOC
     int valorVOC = analogRead(PIN_VOC);
     sensorData.voc = map(valorVOC, 0, 4095, 0, 1000) / 100.0; // 0-10
     
     // Leer voltaje de batería
     int valorBateria = analogRead(PIN_BATERIA);
     sensorData.bateria = map(valorBateria, 0, 4095, 0, 1500) / 100.0; // 0-15V
   }
   
   // Determinar calidad del agua basada en turbidez y pH
   if (sensorData.turbidez < 5.0 && sensorData.ph >= 6.5 && sensorData.ph <= 7.5) {
     sensorData.calidad_agua = "Excelente";
   } else if (sensorData.turbidez < 10.0 && sensorData.ph >= 6.0 && sensorData.ph <= 8.0) {
     sensorData.calidad_agua = "Buena";
   } else if (sensorData.turbidez < 20.0 && sensorData.ph >= 5.5 && sensorData.ph <= 8.5) {
     sensorData.calidad_agua = "Regular";
   } else {
     sensorData.calidad_agua = "Deficiente";
   }
   
   // Imprimir valores para depuración
   Serial.println("=== DATOS DE SENSORES ===");
   Serial.println("Temperatura: " + String(sensorData.temperatura) + " °C");
   Serial.println("Humedad: " + String(sensorData.humedad) + " %");
   Serial.println("CO2: " + String(sensorData.co2) + " ppm");
   Serial.println("VOC: " + String(sensorData.voc));
   Serial.println("Batería: " + String(sensorData.bateria) + " V");
   Serial.println("pH: " + String(sensorData.ph));
   Serial.println("Turbidez: " + String(sensorData.turbidez) + " NTU");
   Serial.println("Calidad del agua: " + sensorData.calidad_agua);
   Serial.println("========================");
 }
 
 /**
  * Envía los datos al broker MQTT
  */
 void enviarDatosMQTT() {
   // Crear documento JSON
   StaticJsonDocument<256> doc;
   
   // Añadir datos al documento
   doc["temperatura"] = sensorData.temperatura;
   doc["humedad"] = sensorData.humedad;
   doc["co2"] = sensorData.co2;
   doc["voc"] = sensorData.voc;
   doc["bateria"] = sensorData.bateria;
   doc["ph"] = sensorData.ph;
   doc["turbidez"] = sensorData.turbidez;
   doc["calidad_agua"] = sensorData.calidad_agua;
   
   // Serializar a String
   String jsonString;
   serializeJson(doc, jsonString);
   
   // Publicar en MQTT
   Serial.println("Enviando datos MQTT: " + jsonString);
   mqttClient.publish(MQTT_TOPIC, jsonString.c_str());
 }
 
 // ==================== SETUP Y LOOP ====================
 
 void setup() {
   // Iniciar comunicación serial
   Serial.begin(115200);
   Serial.println("\n=== GREENHOUSE MONITOR - ESP32 ===");
   
   // Configurar pines
   pinMode(PIN_HUMEDAD_SUELO, INPUT);
   pinMode(PIN_PH, INPUT);
   pinMode(PIN_TURBIDEZ, INPUT);
   pinMode(PIN_CO2, INPUT);
   pinMode(PIN_VOC, INPUT);
   pinMode(PIN_BATERIA, INPUT);
   
   // Inicializar sensores
   inicializarSensores();
   
   // Configurar WiFi
   setupWiFi();
   
   // Configurar MQTT
   mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
   
   Serial.println("Sistema iniciado en modo " + String(modoSimulacion ? "SIMULACIÓN" : "REAL"));
 }
 
 void loop() {
   // Verificar conexión WiFi
   if (WiFi.status() != WL_CONNECTED) {
     Serial.println("Conexión WiFi perdida. Reconectando...");
     setupWiFi();
   }
   
   // Verificar conexión MQTT
   if (!mqttClient.connected()) {
     reconnectMQTT();
   }
   mqttClient.loop();
   
   // Leer sensores periódicamente
   unsigned long tiempoActual = millis();
   if (tiempoActual - ultimaLectura >= INTERVALO_LECTURA) {
     ultimaLectura = tiempoActual;
     leerSensores();
   }
   
   // Enviar datos periódicamente
   if (tiempoActual - ultimoEnvio >= INTERVALO_ENVIO) {
     ultimoEnvio = tiempoActual;
     enviarDatosMQTT();
   }
 }
 
 