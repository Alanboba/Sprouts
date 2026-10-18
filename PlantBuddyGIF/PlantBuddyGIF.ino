#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include "plant_frames.h"
#include "plant_lovey.h"

#define TFT_CS   5
#define TFT_DC   16
#define TFT_RST  17
#define TFT_SCLK 18
#define TFT_MOSI 23
#define SOIL_PIN 34

Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
const int DRY_THRESHOLD = 2500; // Calibrate using Serial Monitor
const int SCALE = 10;            // 24x24 source becomes 120x120 on screen
const int DISPLAY_W = 240;
const int DISPLAY_H = 280;
const int FRAME_DELAY_MS = 200;
uint16_t scaledLine[240];
bool previousDryState = false;
bool firstRun = true;

bool isSoilDry() {
  int reading = analogRead(SOIL_PIN);

  Serial.print("Soil moisture reading: ");
  Serial.println(reading);

  return reading <= DRY_THRESHOLD;
}

void drawFrame(const uint16_t* frame, int width, int height) {
  int drawWidth = width * SCALE;
  int drawHeight = height * SCALE;
  int startX = (DISPLAY_W - drawWidth) / 2;
  int startY = (DISPLAY_H - drawHeight) / 2;
  for (int y = 0; y < height; y++) {
    int out = 0;
    for (int x = 0; x < width; x++) {
      uint16_t color = pgm_read_word(&frame[y * width + x]);
      for (int k = 0; k < SCALE; k++) scaledLine[out++] = color;
    }
    tft.startWrite();
    for (int k = 0; k < SCALE; k++) {
      tft.setAddrWindow(startX, startY + y * SCALE + k, drawWidth, 1);
      for (int x = 0; x < drawWidth; x++) tft.writeColor(scaledLine[x], 1);
    }
    tft.endWrite();
  }
}

template <size_t FRAME_COUNT, size_t FRAME_PIXELS>
void playAnimation(const uint16_t (&frames)[FRAME_COUNT][FRAME_PIXELS], int width, int height, bool animationIsForDrySoil) {
  for (size_t frame = 0; frame < FRAME_COUNT; frame++) {
    bool currentlyDry = isSoilDry();
    if (currentlyDry != animationIsForDrySoil) return;
    drawFrame(&frames[frame][0], width, height);
    delay(FRAME_DELAY_MS);
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 280);
  tft.setRotation(0);
  tft.fillScreen(0xE6F8); // pale cream background
  Serial.println("Plant Buddy started!");
  Serial.println("Checking soil moisture...");
}

void loop() {
  bool dry = isSoilDry();
  if (firstRun || dry != previousDryState) {
    tft.fillScreen(0xE6F8);
    previousDryState = dry;
    firstRun = false;
  }
  if (dry) playAnimation(plantFrames, PLANT_FRAME_W, PLANT_FRAME_H, true);
  else playAnimation(plantLovelyFrames, LOVELY_FRAME_W, LOVELY_FRAME_H, false);
}
