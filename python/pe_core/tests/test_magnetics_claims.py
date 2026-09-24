"""Numbers the 04-magnetics pages and the catalogue notes state about the
equations, checked against the exact models they approximate.

* Dowell's series (`wind.dowell_low`) against Dowell's factor (`wind.dowell`);
* the layer thickness of least loss (`wind.phi_opt`) against the exact
  optimum of Dowell's factor;
* the reading of an impedance meter below self-resonance (`meas.L_app`);
* the ringing frequency with an added capacitor (`snub.C_par`) and the
  snubber resistor's range for AN11160's damping factor (`snub.R`);
* the core geometrical constant's scaling with the core's size (`mag.Kg_core`).
"""

from __future__ import annotations

import mpmath as mp
import pytest

mp.mp.dps = 40


def dowell(phi: mp.mpf, m: int) -> mp.mpf:
    skin = (mp.sinh(2 * phi) + mp.sin(2 * phi)) / (mp.cosh(2 * phi) - mp.cos(2 * phi))
    prox = (mp.sinh(phi) - mp.sin(phi)) / (mp.cosh(phi) + mp.cos(phi))
    return phi * (skin + mp.mpf(2) / 3 * (m**2 - 1) * prox)


def dowell_low(phi: mp.mpf, m: int) -> mp.mpf:
    return 1 + (5 * m**2 - 1) * phi**4 / 45


def phi_opt(m: int) -> mp.mpf:
    return (mp.mpf(15) / (5 * m**2 - 1)) ** mp.mpf("0.25")


def exact_optimum(m: int) -> mp.mpf:
    """The layer thickness (in skin depths) at which Dowell's F_R/phi is least."""
    return mp.findroot(lambda p: mp.diff(lambda q: dowell(q, m) / q, p), phi_opt(m))


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
        return 1 / (1 - x**2)

    assert abs(reading(mp.mpf("0.1")) - 1 - mp.mpf("0.0101")) < mp.mpf("1e-4")
    assert abs(reading(1 / mp.sqrt(2)) - 2) < mp.mpf("1e-30")
    assert abs(1 / mp.sqrt(2) - mp.mpf("0.71")) < mp.mpf("0.003")


def test_adding_three_times_the_capacitance_halves_the_ringing_frequency() -> None:
    c_par, c_add = mp.mpf(1), mp.mpf(3)
    f0, f1 = 1 / mp.sqrt(c_par), 1 / mp.sqrt(c_par + c_add)
    assert f1 / f0 == mp.mpf("0.5")
    # and the catalogue's formula recovers the capacitance
    assert abs(c_add / ((f0 / f1) ** 2 - 1) - c_par) < mp.mpf("1e-30")


def test_snubber_resistor_range_for_the_damping_factor() -> None:
    """snub.R's note: a damping factor between 0.5 and 1 puts the resistor
    between sqrt(L_par/C_snub) and twice that; it is the damping factor of the
    series loop L_par, R, C_snub (roots of s^2 L C + s R C + 1)."""
    L, C = mp.mpf("1.2665e-6"), mp.mpf("1e-10")
    z0 = mp.sqrt(L / C)
    for zeta, ratio in ((mp.mpf("0.5"), 1), (mp.mpf(1), 2)):
        r = 2 * zeta * mp.sqrt(L / C)
        assert abs(r / z0 - ratio) < mp.mpf("1e-30")
        # the loop's poles have that damping factor (critically damped at 1)
        roots = mp.polyroots([L * C, r * C, 1], maxsteps=100, extraprec=60)
        w0 = 1 / mp.sqrt(L * C)
        assert abs(-mp.re(roots[0]) / w0 - zeta) < mp.mpf("1e-12")


def test_core_constant_grows_as_the_fifth_power_of_size() -> None:
    a_e, w_a, mlt, s = mp.mpf("5e-5"), mp.mpf("6e-5"), mp.mpf("0.05"), mp.mpf("1.3")
    k1 = a_e**2 * w_a / mlt
    k2 = (a_e * s**2) ** 2 * (w_a * s**2) / (mlt * s)
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
