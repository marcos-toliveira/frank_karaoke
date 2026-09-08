const assert = require('assert');
const { BandpassFilter } = require('../extension/bandpass.js');
const { PitchDetector } = require('../extension/yin.js');
const {
  hzToMidi,
  midiToHz,
  hzToSemitoneDistance,
  AudioPresets,
  ScoringModes,
  ScoringSession
} = require('../extension/scoring.js');

console.log('=== Iniciando Bateria de Testes do Motor DSP de Áudio ===');

// 1. Testes de conversão de Frequência e MIDI
console.log('Test 1: Conversão Hz <-> MIDI');
assert.strictEqual(Math.round(hzToMidi(440)), 69, 'A4 (440Hz) deve mapear para MIDI 69');
assert(Math.abs(midiToHz(69) - 440.0) < 0.001, 'MIDI 69 deve mapear para 440Hz');
assert(Math.abs(hzToSemitoneDistance(440, 880) - 12.0) < 0.001, 'Dobro da frequência deve ser 12 semitons');
console.log('  ✓ Conversões matemáticas de pitch validadas com sucesso.');

// 2. Testes do Filtro Bandpass (200 - 3500 Hz)
console.log('Test 2: Resposta do Filtro Bandpass');
const sampleRate = 44100;
const filter = new BandpassFilter(sampleRate, 200, 3500);

function generateSine(freq, numSamples, sampleRate) {
  const buf = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    buf[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return buf;
}

// Sinal em 440 Hz (Voz / dentro da banda)
const voiceSine = generateSine(440, 2048, sampleRate);
filter.reset();
const filteredVoice = filter.process(voiceSine);
let voiceEnergy = 0;
for (let i = 500; i < 2048; i++) voiceEnergy += filteredVoice[i] * filteredVoice[i];
voiceEnergy = Math.sqrt(voiceEnergy / (2048 - 500));

// Sinal em 50 Hz (Grave / fora da banda - corte 200 Hz)
const bassSine = generateSine(50, 2048, sampleRate);
filter.reset();
const filteredBass = filter.process(bassSine);
let bassEnergy = 0;
for (let i = 500; i < 2048; i++) bassEnergy += filteredBass[i] * filteredBass[i];
bassEnergy = Math.sqrt(bassEnergy / (2048 - 500));

assert(voiceEnergy > 0.6, `Energia da voz (440Hz) deve ser alta: ${voiceEnergy}`);
assert(bassEnergy < 0.15, `Energia de graves (50Hz) deve ser fortemente atenuada: ${bassEnergy}`);
console.log(`  ✓ Bandpass isolou voz (440Hz: ${voiceEnergy.toFixed(2)}) e atenuou grave (50Hz: ${bassEnergy.toFixed(2)})`);

// 3. Testes do Algoritmo YIN (Detecção de Pitch)
console.log('Test 3: Detecção de Pitch YIN');
const yin = new PitchDetector(sampleRate, 0.70);

// A4 = 440 Hz
const a4Sine = generateSine(440, 2048, sampleRate);
const a4Result = yin.detectPitchWithConfidence(a4Sine);
assert(Math.abs(a4Result.pitchHz - 440.0) < 2.0, `YIN deve detectar A4 próximo de 440Hz, obteve: ${a4Result.pitchHz}`);
assert(a4Result.confidence > 0.8, `Confiança para onda senoidal pura deve ser > 0.8, obteve: ${a4Result.confidence}`);

// C4 = 261.63 Hz
const c4Sine = generateSine(261.63, 2048, sampleRate);
const c4Result = yin.detectPitchWithConfidence(c4Sine);
assert(Math.abs(c4Result.pitchHz - 261.63) < 2.0, `YIN deve detectar C4 próximo de 261.63Hz, obteve: ${c4Result.pitchHz}`);

// Ruído branco (sem pitch definido)
const noise = new Float64Array(2048);
for (let i = 0; i < 2048; i++) noise[i] = (Math.random() * 2 - 1) * 0.1;
const noiseResult = yin.detectPitchWithConfidence(noise);
assert(noiseResult.confidence < 0.3 || noiseResult.pitchHz < 60, 'Ruído não deve produzir pitch confiável');
console.log('  ✓ YIN detectou 440Hz e 261.63Hz com precisão submétrica e rejeitou ruído.');

// 4. Testes do ScoringSession
console.log('Test 4: Sessão de Pontuação');
global.PitchDetector = PitchDetector;
global.BandpassFilter = BandpassFilter;

let lastUpdate = null;
const session = new ScoringSession({
  preset: AudioPresets.clean,
  mode: ScoringModes.streak,
  onUpdate: (data) => {
    lastUpdate = data;
  }
});

session.start();
session.warmupDone = true; // Simula final do warmup de 5s

// Alimenta com frames de A4 (440Hz)
for (let i = 0; i < 15; i++) {
  session.processFrame(a4Sine, 0.5);
}

assert(lastUpdate !== null, 'Deve emitir atualizações de pontuação');
assert(lastUpdate.noteName.startsWith('A'), `Deve identificar nota A (Lá), obteve: ${lastUpdate.noteName}`);
assert(lastUpdate.totalScore > 0, `Pontuação deve ser positiva após cantar afinado, obteve: ${lastUpdate.totalScore}`);
assert(session.streakCount >= 5, `Modo streak deve incrementar combo consecutivo, obteve: ${session.streakCount}`);
console.log(`  ✓ Sessão de pontuação calculou nota=${lastUpdate.noteName}, score=${lastUpdate.totalScore}, streak=${session.streakCount}x.`);

console.log('=== TODOS OS TESTES PASSARAM COM SUCESSO! ===');
