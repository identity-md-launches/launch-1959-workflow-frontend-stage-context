let audio: AudioContext | undefined;
export function blip(win = false) {
  try {
    if (localStorage.getItem("hh-sound") !== "on") return;
    audio ??= new AudioContext();
    void audio.resume();
    const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [440];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator(),
        g = audio!.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.035, audio!.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        audio!.currentTime + i * 0.12 + 0.12,
      );
      o.connect(g);
      g.connect(audio!.destination);
      o.start(audio!.currentTime + i * 0.12);
      o.stop(audio!.currentTime + i * 0.12 + 0.13);
    });
  } catch {
    /* Sound is optional. */
  }
}
