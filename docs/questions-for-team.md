# Open questions for the team

None of these block M0–M4. They affect M5 (BLE) unless noted.

| #   | Question                                                                                                                                                          | Who          | Why it matters                                                    | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------- | ------ |
| 1   | Do ECG and SCG reach the BL653µ as analog signals (internal ADC) or from digital front-end chips (e.g. MAX30003 / ADXL355 as in the paper)? Resolution and units? | Arsh         | sample format, volts conversion                                   | open   |
| 2   | Will BLE really carry 3 kHz for both channels? The MAX30003 stops at 512 sps. Are different rates per channel acceptable?                                         | Sunny / Arsh | throughput (≈ 96 kbit/s at 3 kHz × 2 × 16 bit), packet format     | open   |
| 3   | Who writes the BL653µ firmware, with which SDK (Zephyr / nRF Connect SDK, smartBASIC)? Can we agree on `docs/ble-protocol.md`?                                    | Arsh         | defines what the app decodes and when M5 can start                | open   |
| 4   | Is a BL653µ dev kit available for early BLE tests with fake data?                                                                                                 | Sunny / Arsh | lets us test M5 before the patch exists                           | open   |
| 5   | Is there an ECG + SCG recording made **at the same time**?                                                                                                        | Sunny        | needed to check alignment on real data (M3)                       | open   |
| 6   | How are the two channels synchronized (common clock, drift)?                                                                                                      | Arsh         | 100 ppm of drift ≈ 60 ms after 10 min, as large as the R→AO delay | open   |
| 7   | May we publish an anonymized recording on the demo site?                                                                                                          | Sunny        | otherwise the public demo uses synthetic data only                | open   |
