cmake_minimum_required(VERSION 3.20)
project(SpaceCadetPinballWeb LANGUAGES CXX)

if(NOT CMAKE_RUNTIME_OUTPUT_DIRECTORY)
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../public/engine")
endif()

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Build this target with emcmake cmake.")
endif()

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(PINBALL_VENDOR "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/SpaceCadetPinball/SpaceCadetPinball")
file(GLOB PINBALL_SOURCES CONFIGURE_DEPENDS "${PINBALL_VENDOR}/*.cpp")
list(REMOVE_ITEM PINBALL_SOURCES "${PINBALL_VENDOR}/SpaceCadetPinball.cpp")

add_executable(space-cadet ${PINBALL_SOURCES} browser.cpp)
target_include_directories(space-cadet PRIVATE "${PINBALL_VENDOR}" "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_options(space-cadet PRIVATE
  -O3 -Wno-nontrivial-memcall
  -sUSE_SDL=2 -sUSE_SDL_MIXER=2 "-sSDL2_MIXER_FORMATS=[]"
)
target_compile_definitions(space-cadet PRIVATE NDEBUG)
target_link_options(space-cadet PRIVATE
  -O3
  -sUSE_SDL=2
  -sUSE_SDL_MIXER=2
  "-sSDL2_MIXER_FORMATS=[]"
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createSpaceCadetModule
  -sENVIRONMENT=web
  -sINVOKE_RUN=0
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=33554432
  -sSTACK_SIZE=2097152
  -sFORCE_FILESYSTEM=1
  -sEXIT_RUNTIME=0
  "-sEXPORTED_RUNTIME_METHODS=['FS','callMain']"
  "-sEXPORTED_FUNCTIONS=['_main','_pinball_input','_pinball_new_game','_pinball_pause','_pinball_sound']"
)
set_target_properties(space-cadet PROPERTIES
  SUFFIX ".js"
)
