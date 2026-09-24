"""Numbers the 04-magnetics pages and the catalogue notes state about the
equations, checked against the exact models they approximate.

Every catalogue equation is evaluated from the expression equations.yaml
ships (with mpmath, at 40 digits), not typed again here, so a change to the
catalogue is checked against the same claims:

* Dowell's series (`wind.dowell_low`) against Dowell's factor (`wind.dowell`);
* the layer thickness of least loss (`wind.phi_opt`) against the exact
  optimum of Dowell's factor, through the relative loss (`wind.loss_rel`);
* the reading of an impedance meter below self-resonance (`meas.L_app`);
* the ringing frequency with an added capacitor (`snub.C_par`) and the
  snubber resistor's range for AN11160's damping factor (`snub.R`);
* the snubber's loss (`snub.P`) and its resistor's dissipation (`snub.P_R`)
  against an energy balance of the charging edge;
* the core geometrical constant's scaling with the core's size (`mag.Kg_core`);
* the open-circuit voltage ratio (`xfmr.V_oc`), and the test-frequency window
  of the leakage measurement, against the transformer model with winding
  resistances.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Callable

import mpmath as mp
import pytest
import sympy as sp

from pe_core.equations import Catalog, load

mp.mp.dps = 40


@lru_cache(maxsize=1)
def _catalog() -> Catalog:
    return load()


@lru_cache(maxsize=None)
def shipped(eq_id: str) -> Callable[..., mp.mpf]:
    """The catalogue's own expression for `eq_id`, as an mpmath function of its inputs by name."""
    cat = _catalog()
    eq = cat.by_id(eq_id)
    names = cat.free_names(eq)
    fn = sp.lambdify([cat.sym(n) for n in names], cat.with_constants(cat.expr(eq)), modules="mpmath")

    def call(**inputs: object) -> mp.mpf:
        assert set(inputs) == set(names), f"{eq_id} takes {names}"
        return fn(*(mp.mpf(inputs[n]) for n in names))

    return call


def dowell(phi: mp.mpf, m: int) -> mp.mpf:
    return shipped("wind.dowell")(phi_l=phi, M_l=m)


def dowell_low(phi: mp.mpf, m: int) -> mp.mpf:
    return shipped("wind.dowell_low")(phi_l=phi, M_l=m)


def phi_opt(m: int) -> mp.mpf:
    return shipped("wind.phi_opt")(M_l=m)


def exact_optimum(m: int) -> mp.mpf:
    """The layer thickness (in skin depths) at which the loss (Dowell's factor over phi) is least."""

    def loss(q: mp.mpf) -> mp.mpf:
        return shipped("wind.loss_rel")(F_R=dowell(q, m), phi_l=q)

    return mp.findroot(lambda p: mp.diff(loss, p), phi_opt(m))


def test_the_claims_evaluate_the_shipped_expressions() -> None:
    """A spot check that the helpers are the catalogue's equations, not copies."""
    cat = _catalog()
    for eq_id, inputs in (
        ("wind.dowell", {"phi_l": 1.0, "M_l": 3.0}),
        ("wind.dowell_low", {"phi_l": 0.5, "M_l": 2.0}),
        ("wind.phi_opt", {"M_l": 3.0}),
        ("xfmr.V_oc", {"n": 0.25, "L_M": 4.0e-4, "L_l1": 4.0e-6}),
        ("snub.P_R", {"f_s": 3.0e5, "C_snub": 1.6e-9, "V_snub": 20.0, "L_par": 3.73e-9, "I_ring": 3.64}),
    ):
        want = cat.evaluate(cat.by_id(eq_id), inputs)
        assert abs(shipped(eq_id)(**inputs) - want) <= abs(want) * mp.mpf("1e-14")


@pytest.mark.parametrize("m", [1, 2, 3, 5, 10, 20, 50])
def test_dowell_series_lies_above_the_factor_by_at_most_4_percent(m: int) -> None:
    worst = mp.mpf(0)
    for i in range(1, 201):
        phi = mp.mpf(i) / 200
        exact, low = dowell(phi, m), dowell_low(phi, m)
        assert low >= exact * (1 - mp.mpf("1e-30"))
        worst = max(worst, (low - exact) / exact)
    assert worst <= 0.042


@pytest.mark.parametrize("m", [2, 3, 4, 6, 10, 20])
def test_optimum_thickness_within_2_percent_for_two_or_more_layers(m: int) -> None:
    exact = exact_optimum(m)
    assert abs(phi_opt(m) - exact) / exact <= 0.02
    # at the exact optimum the exact factor is close to 4/3
    assert abs(dowell(exact, m) - mp.mpf(4) / 3) <= 0.02


def test_one_layer_optimum_is_pi_over_2() -> None:
    assert abs(exact_optimum(1) - mp.pi / 2) < mp.mpf("1e-20")


def test_meter_reading_below_self_resonance() -> None:
    def reading(x: mp.mpf) -> mp.mpf:  # L_app / L at f = x f_srf
        return shipped("meas.L_app")(L=1, f=x, f_srf=1)

    assert abs(reading(mp.mpf("0.1")) - 1 - mp.mpf("0.0101")) < mp.mpf("1e-4")
    assert abs(reading(1 / mp.sqrt(2)) - 2) < mp.mpf("1e-30")
    assert abs(1 / mp.sqrt(2) - mp.mpf("0.71")) < mp.mpf("0.003")


def test_adding_three_times_the_capacitance_halves_the_ringing_frequency() -> None:
    c_par, c_add = mp.mpf(1), mp.mpf(3)
    f0, f1 = 1 / mp.sqrt(c_par), 1 / mp.sqrt(c_par + c_add)
    assert f1 / f0 == mp.mpf("0.5")
    # and the catalogue's formula recovers the capacitance
    assert abs(shipped("snub.C_par")(C_add=c_add, f_r0=f0, f_r1=f1) - c_par) < mp.mpf("1e-30")


def test_snubber_resistor_range_for_the_damping_factor() -> None:
    """snub.R's note: a damping factor between 0.5 and 1 puts the resistor
    between sqrt(L_par/C_snub) and twice that; it is the damping factor of the
    series loop L_par, R, C_snub (roots of s^2 L C + s R C + 1)."""
    L, C = mp.mpf("1.2665e-6"), mp.mpf("1e-10")
    z0 = mp.sqrt(L / C)
    for zeta, ratio in ((mp.mpf("0.5"), 1), (mp.mpf(1), 2)):
        r = shipped("snub.R")(zeta=zeta, L_par=L, C_snub=C)
        assert abs(r / z0 - ratio) < mp.mpf("1e-30")
        # the loop's poles have that damping factor (critically damped at 1)
        roots = mp.polyroots([L * C, r * C, 1], maxsteps=100, extraprec=60)
        w0 = 1 / mp.sqrt(L * C)
        assert abs(-mp.re(roots[0]) / w0 - zeta) < mp.mpf("1e-12")


def charging_edge(L: mp.mpf, C: mp.mpf, R: mp.mpf, V: mp.mpf, I0: mp.mpf) -> tuple[mp.mpf, mp.mpf, mp.mpf]:
    """AN11160's charging edge, solved exactly: a source V behind the
    parasitic inductance L (carrying I0) charges the snubber, R in series with
    C from 0 V (the node's own capacitance left out). Returns the energy the
    resistor takes, the energy the source delivers and the capacitor's final
    voltage, from the closed-form integrals of the loop current."""
    # L di/dt + R i + v_C = V and C dv_C/dt = i: i = A e^{s1 t} + B e^{s2 t}
    s1, s2 = mp.polyroots([L * C, R * C, 1], maxsteps=200, extraprec=100)
    if abs(s1 - s2) < mp.mpf("1e-20") * abs(s1):
        raise ValueError("critically damped: use another damping factor")
    # i(0) = I0, and L di/dt(0) = V - R I0 - v_C(0) with v_C(0) = 0
    di0 = (V - R * I0) / L
    B = (di0 - s1 * I0) / (s2 - s1)
    A = I0 - B
    # both roots have negative real parts: the integrals over [0, inf) in closed form
    charge = mp.re(-A / s1 - B / s2)
    i_squared = mp.re(-(A * A) / (2 * s1) - (B * B) / (2 * s2) - 2 * A * B / (s1 + s2))
    return R * i_squared, V * charge, charge / C


@pytest.mark.parametrize("zeta", ["0.3", "0.75", "1.5"])
@pytest.mark.parametrize("i0", ["0", "0.5", "3"])
def test_snubber_resistor_takes_half_the_capacitor_energy_and_the_inductance_energy(zeta: str, i0: str) -> None:
    """snub.P_R (AN11160's rating) is the energy balance of the charging edge:
    the resistor takes C V^2/2 + L I^2/2 whatever its value, and the
    capacitor ends at V. snub.P, the snubber's added loss, is C V^2 per
    period: this edge's C V^2/2 and the stored C V^2/2 lost at the other."""
    L, C, V, f = mp.mpf("1.2665e-6"), mp.mpf("1e-10"), mp.mpf(100), mp.mpf("1e5")
    I0 = mp.mpf(i0)
    R = shipped("snub.R")(zeta=mp.mpf(zeta), L_par=L, C_snub=C)
    e_r, e_src, v_end = charging_edge(L, C, R, V, I0)
    assert abs(v_end - V) < mp.mpf("1e-25") * V
    assert abs(e_src - C * V**2) < mp.mpf("1e-25") * C * V**2
    p_r = shipped("snub.P_R")(f_s=f, C_snub=C, V_snub=V, L_par=L, I_ring=I0)
    assert abs(e_r * f - p_r) < mp.mpf("1e-20") * p_r
    # the snubber's added loss counts the capacitor's energy twice and not the inductance's
    p = shipped("snub.P")(C_snub=C, V_snub=V, f_s=f)
    assert abs(p - 2 * (p_r - f * L * I0**2 / 2)) < mp.mpf("1e-25") * p


def test_snubber_worked_example_and_an11160_example() -> None:
    """The snubber page: 0.5 A in the example's parasitic inductance adds
    about 16 mW to the resistor's 50 mW share of the 100 mW snubber loss.
    AN11160's own example rounds to 103 mW."""
    f0, f1, c_add = mp.mpf("2e7"), mp.mpf("1e7"), mp.mpf("1.5e-10")
    c_par = shipped("snub.C_par")(C_add=c_add, f_r0=f0, f_r1=f1)
    l_par = shipped("snub.L_par")(f_r0=f0, C_par=c_par)
    c_snub, v, f_s, i_ring = mp.mpf("1e-10"), mp.mpf(100), mp.mpf("1e5"), mp.mpf("0.5")
    p = shipped("snub.P")(C_snub=c_snub, V_snub=v, f_s=f_s)
    p_r = shipped("snub.P_R")(f_s=f_s, C_snub=c_snub, V_snub=v, L_par=l_par, I_ring=i_ring)
    assert abs(p - mp.mpf("0.1")) < mp.mpf("1e-30")
    assert abs(p_r - mp.mpf("0.0658")) < mp.mpf("5e-5")
    # AN11160's first condition on C_S: it stores more than the inductance's initial energy
    assert c_snub * v**2 > l_par * i_ring**2
    an = shipped("snub.P_R")(f_s=3e5, C_snub=mp.mpf("1.6e-9"), V_snub=20, L_par=mp.mpf("3.73e-9"), I_ring=mp.mpf("3.64"))
    assert round(an * 1000) == 103
    # its worked line prints the inductance as 3.37 nH: the same rounded result
    printed = shipped("snub.P_R")(f_s=3e5, C_snub=mp.mpf("1.6e-9"), V_snub=20, L_par=mp.mpf("3.37e-9"), I_ring=mp.mpf("3.64"))
    assert round(printed * 1000) == 103


def test_core_constant_grows_as_the_fifth_power_of_size() -> None:
    kg = shipped("mag.Kg_core")
    a_e, w_a, mlt, s = mp.mpf("5e-5"), mp.mpf("6e-5"), mp.mpf("0.05"), mp.mpf("1.3")
    k1 = kg(A_e=a_e, W_A=w_a, MLT=mlt)
    k2 = kg(A_e=a_e * s**2, W_A=w_a * s**2, MLT=mlt * s)
    assert abs(k2 / k1 - s**5) < mp.mpf("1e-30")
    # twice the K_g: about 15 % larger in each dimension
    assert abs(mp.mpf(2) ** mp.mpf("0.2") - mp.mpf("1.1487")) < mp.mpf("1e-4")


def test_three_layers_against_thickness_as_the_winding_loss_page_says() -> None:
    """Try it on the winding-loss page: with three layers the factor stays close
    to 1 up to half a skin depth, has nearly doubled at one, and rises steeply
    beyond."""
    assert dowell(mp.mpf("0.5"), 3) < 1.1
    assert 1.8 < dowell(mp.mpf(1), 3) < 2
    assert dowell(mp.mpf(2), 3) > 10


# The coupled windings example (examples/synthetic/coupled-pair.yaml) with a
# synthetic pair of winding resistances, for the measurement and leakage pages.
L_M, L_L1, L_L2P, N = mp.mpf("4e-4"), mp.mpf("4e-6"), mp.mpf("4e-6"), mp.mpf("0.25")
R_P, R_S = mp.mpf("0.05"), mp.mpf("0.01")


def shorted_impedance(f: mp.mpf) -> mp.mpc:
    """The primary's impedance with the secondary shorted: its resistance and
    leakage in series with the magnetizing inductance, which the secondary's
    leakage and resistance (referred to the primary) shunt."""
    w = 2 * mp.pi * f
    z2 = R_S / N**2 + 1j * w * L_L2P
    zm = 1j * w * L_M
    return R_P + 1j * w * L_L1 + z2 * zm / (z2 + zm)


def open_ratio(f: mp.mpf) -> mp.mpf:
    """|V2/V1| with the secondary open, the primary's resistance included."""
    w = 2 * mp.pi * f
    zm = 1j * w * L_M
    return abs(N * zm / (R_P + 1j * w * L_L1 + zm))


def test_open_circuit_ratio_is_below_the_turns_ratio() -> None:
    """xfmr.V_oc's note: 1 % low for a leakage of 1 % of L_M; driven from the
    secondary, below 1/n by the secondary's leakage over L_M. The measurement
    page: a winding resistance not small against the reactance lowers it
    further."""
    ratio = shipped("xfmr.V_oc")(n=N, L_M=L_M, L_l1=L_L1)
    assert abs(ratio / N - 1 / mp.mpf("1.01")) < mp.mpf("1e-30")
    assert 0.0098 < 1 - ratio / N < 0.0100
    # at a high enough frequency the model with resistance agrees; at a low one it reads lower
    assert abs(open_ratio(mp.mpf("1e5")) / ratio - 1) < mp.mpf("1e-7")
    assert open_ratio(mp.mpf(100)) < ratio * mp.mpf("0.99")
    # driven from the secondary: V1/V2 = L12/L22, below 1/n by about L_l2'/L_M
    l12, l22 = N * L_M, N**2 * (L_L2P + L_M)
    assert abs((l12 / l22) * N - L_M / (L_L2P + L_M)) < mp.mpf("1e-30")


def test_shorted_reading_rises_at_low_frequency_and_settles_at_the_leakage() -> None:
    """The measurement and leakage pages: with the secondary shorted, a test
    frequency at which the magnetizing reactance is not much larger than the
    secondary's referred resistance reads high, towards the open-circuit
    inductance; once it is, the series inductance settles at the
    short-circuit inductance and stops changing with frequency, while the
    parallel inductance is far off where the reactance is below the
    resistance. The winding-loss page: the low end of the series resistance
    is the primary's plus the secondary's over n^2."""
    l_sc = shipped("xfmr.L_sc_T")(L_l1=L_L1, L_l2p=L_L2P, L_M=L_M)

    def series_l(f: mp.mpf) -> mp.mpf:
        return mp.im(shorted_impedance(f)) / (2 * mp.pi * f)

    # at 1 Hz nearly the open-circuit inductance
    assert series_l(mp.mpf(1)) > mp.mpf("0.95") * (L_L1 + L_M)
    # magnetizing reactance only 16 times the referred resistance at 1 kHz: 20 % high
    assert 15 < 2 * mp.pi * 1000 * L_M / (R_S / N**2) < 16.5
    assert 1.15 < series_l(mp.mpf(1000)) / l_sc < 1.25
    # a decade above within 0.3 %, and flat from there on
    assert abs(series_l(mp.mpf("1e4")) / l_sc - 1) < 0.003
    assert abs(series_l(mp.mpf("1e5")) / l_sc - 1) < 0.0002
    # at 1 kHz the leakage reactance is below the resistance, and the parallel model reads far off
    z = shorted_impedance(mp.mpf(1000))
    q = mp.im(z) / mp.re(z)
    assert q < 1
    assert series_l(mp.mpf(1000)) * (1 + 1 / q**2) > 10 * l_sc
    # the series resistance at the low end: the primary's plus the secondary's over n^2, within 2 L_l2'/L_M
    r_low = mp.re(shorted_impedance(mp.mpf("1e4")))
    assert abs(r_low / (R_P + R_S / N**2) - 1) < 2 * L_L2P / L_M
