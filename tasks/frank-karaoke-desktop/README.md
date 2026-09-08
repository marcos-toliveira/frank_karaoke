# Tarefa: Portabilidade Desktop do Frank Karaoke (Manjaro Linux)

## Metadados
- **ID da Tarefa**: `frank-karaoke-desktop`
- **Data**: 08/09/2026
- **Autor**: `marcos-toliveira`
- **Repositório**: `/home/marcos/Projetos/frank_karaoke`
- **Fork Pessoal**: `git@github.com:marcos-toliveira/frank_karaoke.git`
- **Upstream Oficial**: `https://github.com/akitaonrails/frank_karaoke.git`
- **Status**: Concluído e Validado

---

## 1. Contexto e Motivação
O projeto original de Fabio Akita (*Frank Karaoke*) foi desenvolvido em Flutter visando primariamente Android, após o autor abandonar a versão desktop Linux devido a problemas severos com Chromium Embedded Framework (conflito de GPU no Wayland e travamento de sessão gráfica), ausência de WebView oficial no Flutter Linux e bugs em codecs MediaCodec / just_audio.

Entretanto, uma análise arquitetural revelou que **100% da interface do Frank Karaoke já é renderizada em HTML/CSS/JavaScript puro via injeção no DOM do YouTube**.
A portabilidade direta para o Manjaro Linux (KDE Plasma / X11) foi realizada reimplementando o pipeline de áudio e DSP (Bandpass + YIN + Scoring + Calibração) em JavaScript nativo para Web Audio API, eliminando intermediários de SO ou dependências pesadas de Flutter.

---

## 2. Componentes Criados

### 2.1 Módulos de DSP e Áudio (`desktop/extension/`)
- **`bandpass.js`**: Filtro IIR Butterworth de 2ª ordem cascateado (passa-baixa a 3500 Hz e passa-alta a 200 Hz, Q = 0.707). Atenua vazamentos graves de caixas de som e agudos de pratos, isolando a faixa vocal humana.
- **`yin.js`**: Implementação pura do algoritmo YIN (de Cheveigné & Kawahara, 2002) com função de diferença acumulada, normalização CMNDF, threshold relaxado (0.70), interpolação parabólica e cálculo de métrica de confiança vocal e RMS.
- **`scoring.js`**: Motor de pontuação contendo os 4 modos oficiais:
  1. *Pitch Match*: Estabilidade e afinação em semitons via distribuição gaussiana ponderada pela confiança.
  2. *Contour*: Avaliação do contorno melódico e variação dinâmica (2 a 6 semitons).
  3. *Intervals*: Qualidade musical dos saltos intervalares de semitons.
  4. *Streak*: Pontuação com multiplicador de combo consecutivo e penalidade em falhas.
  Suporta calibração de microfone de 3 segundos, histórico de RMS adaptativo e compensação de Pitch Shift (±6 semitons).
- **`overlay.js`**: Camada visual oficial com tela de boas-vindas, visualizador de pitch trail em `<canvas>`, exibição de notas e energia de microfone, modal de configurações, presets (Clean, Room, Party) e tela de celebração final com confetes.
- **`content.js`**: Script de orquestração do YouTube. Monitora o `<video>` HTML5 via MutationObserver, controla playback e pitch shift (`v.preservesPitch = false; v.playbackRate = Math.pow(2, semitones/12)`), solicita permissão de microfone e alimenta o pipeline.
- **`manifest.json`**: Manifesto de Extensão Chrome (Manifest V3) para execução no Google Chrome ou em modo Standalone App.

### 2.2 Integração com o Desktop Manjaro/KDE (`desktop/`)
- **`frank-karaoke-desktop.sh`**: Script que inicializa o Google Chrome em modo de aplicação independente (`--app=https://www.youtube.com`), com aceleração de GPU no X11 e a extensão Frank Karaoke automaticamente injetada.
- **`frank-karaoke.desktop`**: Atalho padrão XDG para o lançador de aplicativos do KDE Plasma com metadados de categoria e ícone.
- **`install.sh`**: Script de instalação em um clique que copia o lançador para `~/.local/share/applications/` e os ícones para `~/.local/share/icons/`.

### 2.3 Testes Automatizados (`desktop/tests/`)
- **`test_dsp.js`**: Teste unitário em Node.js verificando:
  - Estabilidade e atenuação do filtro Bandpass.
  - Precisão do algoritmo YIN na detecção de frequências senoidais (A4 440 Hz, C4 261.63 Hz, E4 329.63 Hz).
  - Cálculo de conversão Hz <-> MIDI e intervalos em semitons.
  - Atualização dos 4 modos de pontuação.

---

## 3. Evidências de Execução e Testes
Execute o teste local de validação matemática do DSP:
```bash
node desktop/tests/test_dsp.js
```
