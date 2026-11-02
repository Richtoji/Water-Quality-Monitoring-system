#include <Arduino.h>

void setup() {
    // Initialize serial communication at 115200 baud
    Serial.begin(115200);
    // Brief delay to ensure serial connection is ready
    delay(1000);
    Serial.println("System starting...");
}

void loop() {
    // Print message every 2 seconds
    Serial.println("ESP32 is working!");
    delay(2000);
}
