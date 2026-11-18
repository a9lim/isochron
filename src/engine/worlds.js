// The worlds off Earth people may settle (docs/people.md): the people's model (src/engine/people.js)
// opens them and splits its people over them; Fig. 9 (src/render/system.js) draws them.

/**
 * The worlds people may settle off Earth (speculation, the order synthesis): each its distance from
 * the Sun (AU), its surface (km²; standard values from memory) or, for the Earth–Moon L4 and L5
 * habitats, the people built there from lunar material, and where it opens, in log₁₀ of the robots
 * at work off-world: near and sunlit first, then the belt, then the outer moons, which wait on power
 * that sunlight at 3.7% and 1.1% of Earth's (1/r², standard) can't give cheaply. Callisto lies
 * outside Jupiter's radiation belts, Europa within them (standard). People beyond their surfaces live
 * in habitats in orbit about the Sun (O'Neill's argument: surfaces are small beside what built
 * habitats hold).
 */
export const WORLDS = [
  { k: 'l45', name: 'L4 and L5', a: 1, around: 'earth', room: 1e11, opens: 5 },
  { k: 'moon', name: 'the Moon', a: 1, around: 'earth', area: 3.79e7, opens: 5.5 },
  { k: 'mars', name: 'Mars', a: 1.524, area: 1.448e8, opens: 6.5 },
  { k: 'ceres', name: 'Ceres', a: 2.77, area: 2.77e6, opens: 7.5 },
  { k: 'callisto', name: 'Callisto', a: 5.2, around: 'jupiter', area: 7.3e7, opens: 8.5 },
  { k: 'ganymede', name: 'Ganymede', a: 5.2, around: 'jupiter', area: 8.7e7, opens: 9 },
  { k: 'europa', name: 'Europa', a: 5.2, around: 'jupiter', area: 3.09e7, opens: 9.5 },
  { k: 'titan', name: 'Titan', a: 9.58, around: 'saturn', area: 8.3e7, opens: 10 },
];
