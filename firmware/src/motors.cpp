#include "motors.h"
#include "pins.h"

static uint32_t lastTailMs = 0;
static bool mouthIsOpen = false;

void motorsBegin() {
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  pinMode(PIN_MOTOR_IN3, OUTPUT);
  pinMode(PIN_MOTOR_IN4, OUTPUT);
  motorsStop();
}

void motorsStop() {
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  digitalWrite(PIN_MOTOR_IN3, LOW);
  digitalWrite(PIN_MOTOR_IN4, LOW);
  mouthIsOpen = false;
}

void mouthOpen() {
  digitalWrite(PIN_MOTOR_IN1, HIGH);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  mouthIsOpen = true;
}

void mouthClose() {
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, HIGH);
  delay(80);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  mouthIsOpen = false;
}

void tailFlop() {
  digitalWrite(PIN_MOTOR_IN3, HIGH);
  digitalWrite(PIN_MOTOR_IN4, LOW);
  delay(120);
  digitalWrite(PIN_MOTOR_IN3, LOW);
  digitalWrite(PIN_MOTOR_IN4, HIGH);
  delay(120);
  digitalWrite(PIN_MOTOR_IN3, LOW);
  digitalWrite(PIN_MOTOR_IN4, LOW);
  lastTailMs = millis();
}

void motorsSelfTest() {
  Serial.println("[motors] self-test: need ENA+ENB jumpers ON, Vin powered, GND shared");
  Serial.println("[motors] mouth (OUT1/OUT2)…");
  mouthOpen();
  delay(400);
  mouthClose();
  delay(200);
  Serial.println("[motors] tail (OUT3/OUT4)…");
  for (int i = 0; i < 2; i++) {
    tailFlop();
    delay(150);
  }
  motorsStop();
  Serial.println("[motors] done — if nothing moved, check ENA/ENB jumpers first");
}

void motorsLipSync(float level01) {
  if (level01 < 0) level01 = 0;
  if (level01 > 1) level01 = 1;
  const float openThresh = 0.12f;
  const float closeThresh = 0.06f;
  if (!mouthIsOpen && level01 >= openThresh) {
    mouthOpen();
  } else if (mouthIsOpen && level01 < closeThresh) {
    digitalWrite(PIN_MOTOR_IN1, LOW);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    mouthIsOpen = false;
  }
}

void motorsTick() {
  if (millis() - lastTailMs > 4500) {
    // idle life — occasional twitch
    if (random(0, 100) < 2) {
      tailFlop();
    }
  }
}
