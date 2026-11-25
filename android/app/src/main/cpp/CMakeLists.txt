cmake_minimum_required(VERSION 3.18.1)
project(ircore CXX)

set(CMAKE_CXX_STANDARD 11)

file(GLOB IR_LIB_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/IRremoteESP8266/*.cpp)

add_library(ircore SHARED
  ${IR_LIB_SOURCES}
  ircore.cpp
  jni_bridge.cpp)

# UNIT_TEST: kütüphaneyi donanımsız (ESP8266/ESP32 olmadan) derler.
# shim/ klasöründeki IRsend_test.h, sinyali yakalayan sürümümüzdür.
target_compile_definitions(ircore PRIVATE UNIT_TEST _IR_LOCALE_=en-AU)
target_include_directories(ircore PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/shim
  ${CMAKE_CURRENT_SOURCE_DIR}/IRremoteESP8266
  ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(ircore PRIVATE -Os -w -fvisibility=hidden)
target_link_options(ircore PRIVATE -Wl,--gc-sections)
target_link_libraries(ircore log)
