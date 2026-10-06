# Open questions for the team

None of these block M0–M5. Most of them only affect M6 (BLE).

| # | Question | Who | Why it matters | Status |
|---|---|---|---|---|
| 1 | Do ECG and SCG reach the BL653µ as analog signals (internal ADC) or from digital front-end chips (e.g. MAX30003 / ADXL355 as in the paper)? Resolution and units? | Arsh | sample format, volts conversion, `INFO` contents | open |
| 2 | Will BLE really carry 3 kHz per channel? Is a lower rate (500 Hz / 1 kHz) acceptable for live view? | Sunny / Arsh | about 96 kbit/s payload at 3 kHz × 2 ch × 16 bit is at the limit on some phones. See also #8 | open |
| 3 | Who writes the BL653µ firmware, in which SDK (Zephyr / nRF Connect SDK, smartBASIC…)? Can we agree on the packet format in `docs/ble-protocol.md`? | Arsh | defines what the app decodes, and when M6 can start | open |
| 4 | Is a BL653µ dev kit available for early BLE tests with fake data? | Sunny / Arsh | lets us test M6 before the patch exists | open |
| 5 | Is there an ECG + SCG recording made **at the same time**? | Sunny | needed to validate alignment and the R→AO delay on real data | open |
| 6 | Is the mains notch at 60 Hz (US) correct for all recordings? Preferred SCG band? | Sunny | default filter settings | open |
| 7 | Does the device sample counter (`firstSampleIndex` in `DATA`) keep running across a BLE disconnect/reconnect? Does it reset on firmware reboot or on a `CONTROL` stop/start? | Arsh | the app fills reconnect gaps with `NaN` using this counter; if it resets, the app must open a new session instead | open |
| 8 | What is the **real sample rate of each channel** on the new patch? The paper's MAX30003 (ECG) goes up to 512 sps, the ADXL355 (SCG) up to 4 kHz, so "3 kHz for both" may be impossible. Does Sunny need ECG at 3 kHz, or are 512 Hz ECG + 3 kHz SCG fine? Will the firmware send each channel at its native rate (our proposal) or resample to a common rate? | Sunny / Arsh | the app now supports a different fs per channel (ADR 0003), but the BLE packet, throughput and filter defaults depend on the answer | open |
| 9 | How are the two channels **synchronized**? Do both counters start at the same instant? Do the two chips share a clock (e.g. ADXL355 external sync/clock from the MCU, MAX30003 crystal), or does the firmware timestamp samples with one MCU timer? How large is the drift? | Arsh | with independent oscillators, 100 ppm of drift is ≈ 60 ms after 10 min, as big as the R→AO delay we want to measure. Until answered, the app assumes no offset and no drift | open |
