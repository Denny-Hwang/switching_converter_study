"""Numbers the 06-bench pages and the catalogue notes state about the
equations, checked against the models they come from.

* the rise time of a single-pole system (`probe.t_rise`): ln 9/(2π) = 0.350,
  and 3.5 ns at 100 MHz, from the step response itself;
* the loop spike (`layout.v_spike`): 10 V from 10 nH, 10 A and 10 ns;
* the inrush pulse (`inrush.I_pk`, `inrush.I2t`): the peak and the joule
  integral of the RC charging current, integrated numerically, and the
  energy the resistance dissipates, C V²/2 whatever the resistance;
* the controlled ramp (`inrush.I_ramp`): 1 A for 100 µF ramped to 48 V over
  4.8 ms, a far smaller joule integral than the step's, and the ramp's
  element dissipates C V²/2 all the same;
* the bootstrap capacitance (`boot.C`): halving the droop doubles it;
* the gate currents (`gate.I_on`, `gate.I_off`, `gate.t_pl`): with the same
  gate-loop resistance at both edges, the turn-off current is the smaller,
  and turn-off the slower, exactly when the plateau is below half the drive
  voltage; the example's 1.1 A and 9.09 ns, 0.9 A and 11.1 ns;
* the probe's ring (`probe.f_ring`): 159 MHz for 100 nH and 10 pF, twice as
  high with a quarter of the inductance, and the root of the series L-C's
  characteristic equation;
* the loop inductance from a ring (`layout.L_ring`): it inverts the ring's
  frequency.
"""

from __future__ import annotations

import mpmath as mp
import pytest

from pe_core import numeric

mp.mp.dps = 40


def ev(eq_id: str, **inputs: float) -> float:
    return numeric.evaluate(eq_id, **inputs)


def test_single_pole_rise_time_constant_is_0_350() -> None:
    k = mp.log(9) / (2 * mp.pi)
    assert abs(k - mp.mpf("0.3497")) < mp.mpf("1e-4")
    assert f"{float(k):.3f}" == "0.350"


def test_single_pole_rise_time_from_the_step_response() -> None:
    # y = 1 - exp(-t/tau): find the 10 % and 90 % crossings numerically
    # (the crossings are found in units of the time constant, then scaled)
    bw = mp.mpf("1e8")
    tau = 1 / (2 * mp.pi * bw)
    t10 = tau * mp.findroot(lambda u: 1 - mp.exp(-u) - mp.mpf("0.1"), mp.mpf("0.1"))
    t90 = tau * mp.findroot(lambda u: 1 - mp.exp(-u) - mp.mpf("0.9"), mp.mpf("2"))
    assert abs((t90 - t10) - mp.mpf(ev("probe.t_rise", BW=1e8))) < mp.mpf("1e-22")
    assert f"{float((t90 - t10) * 1e9):.1f}" == "3.5"


def test_loop_spike_example() -> None:
    assert ev("layout.v_spike", L_loop=1e-8, Delta_I=10.0, t_edge=1e-8) == pytest.approx(10.0, rel=1e-12)
    # proportional to the inductance and to the edge's speed
    assert ev("layout.v_spike", L_loop=2e-9, Delta_I=10.0, t_edge=1e-8) == pytest.approx(2.0, rel=1e-12)
    assert ev("layout.v_spike", L_loop=1e-8, Delta_I=10.0, t_edge=5e-9) == pytest.approx(20.0, rel=1e-12)


@pytest.mark.parametrize("V, R, C", [(48.0, 0.1, 1e-4), (12.0, 2.0, 4.7e-6), (400.0, 5.0, 1e-3)])
def test_inrush_peak_and_joule_integral_from_the_charging_current(V: float, R: float, C: float) -> None:
    tau = mp.mpf(R) * mp.mpf(C)
    i = lambda t: mp.mpf(V) / R * mp.exp(-t / tau)  # noqa: E731
    assert float(i(0)) == pytest.approx(ev("inrush.I_pk", V_g=V, R_ser=R), rel=1e-12)
    i2t = mp.quad(lambda t: i(t) ** 2, [0, tau, 10 * tau, mp.inf])
    assert float(i2t) == pytest.approx(ev("inrush.I2t", V_g=V, C_in=C, R_ser=R), rel=1e-12)
    # times R it is the energy the resistance dissipates: C V^2/2, whatever R
    assert float(i2t * R) == pytest.approx(C * V * V / 2, rel=1e-12)


@pytest.mark.parametrize("V, C, T", [(48.0, 1e-4, 4.8e-3), (12.0, 4.7e-6, 1e-4), (400.0, 1e-3, 0.05)])
def test_ramped_inrush_is_constant_and_its_element_dissipates_the_stored_energy(V: float, C: float, T: float) -> None:
    Vm, Cm, Tm = mp.mpf(V), mp.mpf(C), mp.mpf(T)
    v = lambda t: Vm * t / Tm  # noqa: E731
    i = lambda t: Cm * mp.diff(v, t)  # noqa: E731
    for frac in ("0.1", "0.5", "0.9"):
        assert float(i(Tm * mp.mpf(frac))) == pytest.approx(ev("inrush.I_ramp", C_in=C, V_g=V, t_ramp=T), rel=1e-12)
    # the element that sets the ramp drops V - v while it carries the current
    e = mp.quad(lambda t: (Vm - v(t)) * i(t), [0, Tm])
    assert float(e) == pytest.approx(C * V * V / 2, rel=1e-12)


def test_ramped_inrush_example_against_the_step() -> None:
    assert ev("inrush.I_ramp", C_in=1e-4, V_g=48.0, t_ramp=4.8e-3) == pytest.approx(1.0, rel=1e-12)
    # the ramp's joule integral, I^2 t_ramp, against the step's through 0.1 ohm
    ramp_i2t = ev("inrush.I_ramp", C_in=1e-4, V_g=48.0, t_ramp=4.8e-3) ** 2 * 4.8e-3
    assert ramp_i2t == pytest.approx(4.8e-3, rel=1e-12)
    assert ev("inrush.I2t", V_g=48.0, C_in=1e-4, R_ser=0.1) / ramp_i2t == pytest.approx(240.0, rel=1e-12)
    # with the 0.1 ohm still in the path, the path dissipates C V^2/2 in all; the
    # resistance's share, I^2 R t_ramp, is 2 R C / t_ramp of it: nearly all goes
    # to the element that sets the ramp
    e_total = 1e-4 * 48.0**2 / 2
    e_res = ramp_i2t * 0.1
    assert e_res / e_total == pytest.approx(2 * 0.1 * 1e-4 / 4.8e-3, rel=1e-12)
    assert e_res / e_total < 0.005


def test_bootstrap_capacitance_doubles_when_the_droop_halves() -> None:
    a = ev("boot.C", Q_boot=5e-8, Delta_V_boot=0.5)
    b = ev("boot.C", Q_boot=5e-8, Delta_V_boot=0.25)
    assert a == pytest.approx(1e-7, rel=1e-12)
    assert b == pytest.approx(2 * a, rel=1e-12)


@pytest.mark.parametrize("V_GS, V_pl", [(10.0, 4.5), (12.0, 3.0), (15.0, 7.4), (10.0, 5.5), (12.0, 7.0), (20.0, 2.0)])
def test_turn_off_is_the_slower_edge_exactly_when_the_plateau_is_below_half_the_drive(V_GS: float, V_pl: float) -> None:
    R_G, Q_GD = 5.0, 1e-8
    on = ev("gate.I_on", V_GS=V_GS, V_pl=V_pl, R_G=R_G)
    off = ev("gate.I_off", V_pl=V_pl, R_G=R_G)
    below_half = V_pl < V_GS / 2
    assert (off < on) == below_half
    assert (ev("gate.t_pl", Q_GD=Q_GD, I_G=off) > ev("gate.t_pl", Q_GD=Q_GD, I_G=on)) == below_half


def test_gate_example() -> None:
    on = ev("gate.I_on", V_GS=10.0, V_pl=4.5, R_G=5.0)
    off = ev("gate.I_off", V_pl=4.5, R_G=5.0)
    assert on == pytest.approx(1.1, rel=1e-12)
    assert off == pytest.approx(0.9, rel=1e-12)
    assert f"{ev('gate.t_pl', Q_GD=1e-8, I_G=on) * 1e9:.2f}" == "9.09"
    assert f"{ev('gate.t_pl', Q_GD=1e-8, I_G=off) * 1e9:.1f}" == "11.1"


def test_probe_ring() -> None:
    f = ev("probe.f_ring", L_gnd=1e-7, C_probe=1e-11)
    assert f"{f / 1e6:.1f}" == "159.2"
    # a quarter of the inductance (a lead four times shorter) doubles it
    assert ev("probe.f_ring", L_gnd=0.25e-7, C_probe=1e-11) == pytest.approx(2 * f, rel=1e-12)
    # s = j 2 pi f is a root of the series L-C's characteristic equation L C s^2 + 1 = 0
    L, C = mp.mpf("1e-7"), mp.mpf("1e-11")
    w = 1 / mp.sqrt(L * C)
    assert abs(L * C * (1j * w) ** 2 + 1) < mp.mpf("1e-30")
    assert float(w / (2 * mp.pi)) == pytest.approx(f, rel=1e-12)


@pytest.mark.parametrize("L, C", [(1e-7, 1e-11), (5e-9, 2e-10), (2e-8, 1e-9)])
def test_loop_inductance_from_the_ring_inverts_the_ring(L: float, C: float) -> None:
    f = ev("probe.f_ring", L_gnd=L, C_probe=C)
    assert ev("layout.L_ring", f_ring=f, C_node=C) == pytest.approx(L, rel=1e-12)
