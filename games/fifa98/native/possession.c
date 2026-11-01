#include <stdint.h>

extern int32_t fifa98_player_motion_profile(uint32_t, uint32_t, uint32_t,
                                           uint32_t, uint32_t *);

/* BECODE74C64 unowned->actor and callback-free74E58 matching-owner release,
 * including mandatory team state6246C(mode1) and claim history BCDF8. Original pointer
 * equality becomes opaque identity words; no console memory or callbacks run.
 * Acquisition eligibility remains a caller/action/contact precondition.
 * Exact fields, source guards and missing branches: POSSESSION_RECOVERY.md.
 */

static void claim_team_flags(uint32_t actor_field4, uint32_t previous_owner,
                             uint32_t ball_flags, uint32_t *teams) {
    /* Complete claimed/nonzero-a1 path of6246C. Team316 fields only. */
    teams[7] = 0;
    teams[4] = actor_field4 == 0 &&
        (previous_owner == 0 || (ball_flags & UINT32_C(0x20))) ? 0 : 1;
}

static void ownership_history(uint32_t identity, uint32_t actor_field4,
                              uint32_t *history) {
    /* Complete BCDF8 on valid five-row storage and nonnull identity. */
    history[3] = 0;
    if (actor_field4 != 0) {
        if (history[0] != 0) history[0] = 0;
        if (history[1] == 1) history[1] = 0;
    }
    if (history[2] == 1) history[2] = 0;
    uint32_t index = history[4];
    if (history[6 + index * 2] == identity) return;
    index = index < 4 ? index + 1 : 0;
    history[4] = index;
    history[5 + index * 2] = 0;
    history[6 + index * 2] = identity;
}

/* actor[5]=identity,raw+4,raw+492,alternateMode,opponentFlags+1964.
 * state[10]=owner,previousOwner,priorOwner,ballFlags,C5F4,C5EC,C5F0,C630,C63C,
 *            attachmentActor. Last field is deliberately preserved.
 * teams[8]=own240,own280,own292,own252,own316,opponent292,opponent252,
 *          opponent316.
 * history[15]=9C44,9C48,9C4C,98DC,index,row0Half,row0Actor,...row4Half,row4Actor.
 * All labels are source field identities, not newly assigned game meanings.
 *
 * The source calls A651C before ownership change. It is a complete no-op when
 * alternateMode!=0, or when rawActor492==0 and opponentFlags1964 bit80h is
 * clear. Other branches can clear team flags and invoke offside/action/audio
 * callbacks; this native subset rejects them before writes. An existing owner
 * requires other74C64 branches/callbacks and is likewise rejected.
 *
 * Return1 applied;0 unsupported identity/owner/callback domain;-1 null or
 * malformed five-row history. Every rejection leaves all state unchanged.
 * Buffers must be valid distinct native storage. holdBit retains source AND1.
 */
int32_t fifa98_possession_claim_unowned(const uint32_t *actor,
                                       uint32_t hold_bit, uint32_t *state,
                                       uint32_t *teams, uint32_t *history) {
    if (!actor || !state || !teams || !history || history[4] > 4) return -1;
    for (uint32_t index = 0; index < 5; ++index)
        if (history[5 + index * 2] > 65535) return -1;
    if (actor[0] == 0 || state[0] != 0 ||
        (actor[3] == 0 && (actor[2] != 0 || (actor[4] & UINT32_C(0x80))))) return 0;

    uint32_t identity = actor[0];
    uint32_t flags = (state[3] & ~UINT32_C(0x20)) | ((hold_bit & 1) << 5);
    flags &= ~UINT32_C(0x08);
    state[3] = flags;
    state[4] = 0;
    if (state[1] == identity) state[1] = state[2];
    state[0] = identity;
    state[5] = 0; state[6] = 0; state[7] = 0; state[8] = 0;
    teams[0] = identity;
    if (teams[1] == 0 || teams[2] == identity) teams[2] = 0;
    teams[5] = 0; teams[6] = 0;
    if (teams[3] == identity) teams[3] = 0;
    claim_team_flags(actor[1], state[1], flags, teams);
    ownership_history(identity, actor[1], history);
    return 1;
}

/* Callback-free matching-owner release74E58..74F44, including6246C(mode1)
 * and87CAC's entire no-A7878 domain. actor4=[identity,rawActor4,rawActor48,
 * attributeByte58]; state10/teams8 retain the claim ABI. notice2=[ownTeam296,
 * actor308] adds the two fields87CAC can change. A nonzero rawActor4 or a
 * matching ownTeam252 skips87CAC. Otherwise rawActor48 must be zero or
 * ownTeam292 must equal identity to avoid the original action callback.
 * If notification runs with ownTeam296zero, byte58 selects the existing
 * source alternateBaseSpeed[20]; other branches never read that index.
 *
 * Release does NOT call BCDF8: five-row history is untouched. Source counter
 * C5F4 is cleared even for a nonnull mismatched owner; that domain is outside
 * this new transactional ABI and rejects BEFORE all writes. Return1 applied,
 * 0 unsupported identity/owner/callback, -1 null or used index outside0..19.
 * Arrays must have valid distinct storage. This is not full launch75924.
 */
static int32_t release_owner(const uint32_t *actor, uint32_t *state,
                              uint32_t *teams, uint32_t *notice,
                              uint32_t solo_selection_noop) {
    if (!actor || !state || !teams || !notice) return -1;
    uint32_t identity = actor[0];
    if (!identity || state[0] != identity) return 0;
    uint32_t notify = actor[1] == 0 && teams[3] != identity;
    if (notify && actor[2] != 0 && teams[2] != identity &&
        !solo_selection_noop) return 0;
    uint32_t updated_actor308 = notice[1];
    if (notify && notice[0] == 0) {
        uint32_t profile[8];
        /* Existing compiled original table already supplies80129354; index48
         * is irrelevant to profile[0] on this alternate-base branch. */
        if (!fifa98_player_motion_profile(0, actor[3], 0, 1, profile)) return -1;
        updated_actor308 = profile[0];
    }

    state[4] = 0;
    uint32_t prior_previous = state[1];
    state[1] = identity; state[0] = 0; state[2] = prior_previous;
    state[3] &= ~UINT32_C(0x20);
    if (notify) {
        notice[1] = updated_actor308;
        notice[0] = identity;
    }
    if (state[9] == identity) state[9] = 0;
    if (teams[3] != identity) teams[3] = 0;
    /* Previous owner is now identity!=0 and source bit20 has been cleared,
     * so6246C(mode1) necessarily writes own316=1/opponent316=0. */
    claim_team_flags(actor[1], state[1], state[3], teams);
    return 1;
}

int32_t fifa98_possession_release(const uint32_t *actor, uint32_t *state,
                                 uint32_t *teams, uint32_t *notice) {
    return release_owner(actor, state, teams, notice, 0);
}

/* Proven one-controlled-actor87CAC->A7878 no-op domain. roster2 replaces
 * ownTeam1908 and its sole196 entry: count1/identitymatchesactor. rawActor4
 * must be zero and rawActor48 nonzero. A7878's direct roster scan rejects
 * raw4zero;5F4F8/5F714/5F830 reject raw48nonnull; its5F910->5F5FC wrapper
 * requires raw4nonnull and therefore rejects this actor as well. All candidate
 * helpers are read-only. Consequently every A7878 path selectsNULL and exits
 * atA7AEC without6004C/ownTeam280 mutation. This is a structural source proof,
 * not an invented callback result. General controller selection is excluded.
 * All other original release/notification effects remain in release_owner.
 */
int32_t fifa98_possession_release_solo(const uint32_t *actor, uint32_t *state,
                                      uint32_t *teams, uint32_t *notice,
                                      const uint32_t *roster) {
    if (!actor || !state || !teams || !notice || !roster) return -1;
    if (roster[0] != 1 || roster[1] != actor[0] || actor[1] != 0 ||
        actor[2] == 0) return 0;
    return release_owner(actor, state, teams, notice, 1);
}
