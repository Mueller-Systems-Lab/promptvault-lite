use std::time::Instant;

#[test]
#[ignore]
fn perf_check() {
    let short = "Übersetze ins Englische: {{text}}";
    let _ = promptvault_lite_lib::analysis::r2::evaluate_for_test(short);

    let mut times = Vec::new();
    for _ in 0..5 {
        let t0 = Instant::now();
        let _ = promptvault_lite_lib::analysis::r2::evaluate_for_test(short);
        times.push(t0.elapsed().as_millis());
    }
    times.sort();
    println!(
        "short p50 (after warmup): {}ms (runs: {:?})",
        times[2], times
    );

    let mut med = String::from("Erstelle einen Projektbericht.\n\n");
    for i in 0..20 {
        med.push_str(&format!(
            "Abschnitt {i}: Beschreibe das Thema mit Details und Zielen.\n"
        ));
    }
    let mut tms = Vec::new();
    for _ in 0..5 {
        let t0 = Instant::now();
        let _ = promptvault_lite_lib::analysis::r2::evaluate_for_test(&med);
        tms.push(t0.elapsed().as_millis());
    }
    tms.sort();
    println!("medium p50: {}ms (runs: {:?})", tms[2], tms);

    let mut large = String::from("Analyse:\n\n");
    for i in 0..2000 {
        large.push_str(&format!(
            "Zeile {i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n"
        ));
    }
    let mut lms = Vec::new();
    for _ in 0..3 {
        let t0 = Instant::now();
        let _ = promptvault_lite_lib::analysis::r2::evaluate_for_test(&large);
        lms.push(t0.elapsed().as_millis());
    }
    lms.sort();
    println!("large p50: {}ms (runs: {:?})", lms[1], lms);

    let mut big = String::new();
    while big.len() < 100_000 {
        big.push_str("Füllertext mit Wörtern und Sätzen für die Performance-Messung. ");
    }
    let mut bms = Vec::new();
    for _ in 0..3 {
        let t0 = Instant::now();
        let _ = promptvault_lite_lib::analysis::r2::evaluate_for_test(&big);
        bms.push(t0.elapsed().as_millis());
    }
    bms.sort();
    println!("100K p50: {}ms (runs: {:?})", bms[1], bms);
}
