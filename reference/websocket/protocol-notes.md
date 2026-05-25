# Triplejack WebSocket Protocol Notes

This folder is ignored by Git. Use it for copied WebSocket captures, local notes, and protocol reconstruction.

Do not paste unsanitized login strings, session UUIDs, auth tokens, or private player data into committed files.

## Frame Shape

Most frames are text strings with a command prefix followed by a colon:

```text
command:payload
```

Some commands have an empty payload:

```text
join_lounge:
gamesdone:
keepalive:
```

Payload formats vary by command:

- JSON object: `session_id:{"sessionUuid":"..."}`
- Comma tuple: `login:...`
- Curly-brace tuple/list protocol: `lbrowse:{...}`
- URL-encoded fragments inside tuple fields: `%7B%22set%22...%7D`
- HTML fragments inside tuple fields: `%3Cfont...%3E`

## Observed Client-To-Server Frames

### `check_auto_reconnect`

```text
check_auto_reconnect:<uuid>
```

Likely checks whether the browser can resume a previous session.

### `login_string`

```text
login_string:<playerId>-<token>
```

Authentication-related. Treat the payload as sensitive.

### `login`

```text
login:<playerId>-<token>,,,,,,,,1,1,,0,,,<encoded user agent>,<screen width>,<screen height>
```

Authentication and client environment handshake. Treat the token as sensitive.

### `join_lounge`

```text
join_lounge:
```

Requests lobby/lounge data.

### `set_web_client_type`

```text
set_web_client_type:{"browserName":"Chrome","fullBrowserVersion":"...","isMobile":false,...}
```

Sends browser capability information as JSON.

### `init_lobby`

```text
init_lobby:,
```

Appears to request or initialize lobby data after joining.

### `set_metadata`

```text
set_metadata:{"id":"...","browserName":"Chrome","browserWindowDimensions":"...","webGlSupportViaCanvasContext":true,...}
```

Sends display and WebGL capability metadata.

### `keepalive`

```text
keepalive:<uuid>
keepalive:
```

Heartbeat frames. Both UUID-bearing and empty forms have been observed:

```text
keepalive:<uuid>
keepalive:
```

Observed request/response pattern:

```text
out keepalive:<uuid>
in  keepalive:
```

Notes:

- The UUID-bearing frame is the client heartbeat/ping.
- The server responds with empty `keepalive:`.

Feature use:

- Reconnect/connection health diagnostics.
- Detect stale sockets when expected keepalives stop arriving.

### `lc`

```text
lc:<message text>
```

Observed when sending a public lobby/chat message. Example sanitized flow:

```text
out lc:hi
in  pc:<playerId>,<playerName>,<html containing player label and message text>
```

This appears to be the public-chat send command for at least lobby/public channel chat. The current script also handles outbound `c:<message text>` for table chat, so public chat sending may have multiple command prefixes depending on the active panel/channel.

### `get_player_info`

```text
get_player_info:<playerId>
```

Requests a detailed player profile payload.

Can be sent while seated at a table, including during normal betting action. A `friends_close:` frame has been observed immediately before the `player_info` response, so the site may close the friends panel or related UI before showing player details.

### `friend_add`

```text
friend_add:<playerName>
```

Requests adding a player as a friend. Observed after a player info/profile interaction.

### `friends_open`

```text
friends_open:
```

Requests opening or refreshing the friends list.

### `get_private_msgs_recent`

```text
get_private_msgs_recent:
```

Requests the recent direct-message conversation list.

### `private_msgs_log`

```text
private_msgs_log:<conversationPlayerId>,<lastUnreadMessageIdOrCursor>
```

Requests the message log for a specific direct-message conversation.

Observed:

```text
private_msgs_log:<playerId>,-1
```

The second field may be the last unread message id, a cursor, or a sentinel meaning “load the current/recent log”.

## Observed Server-To-Client Frames

### `session_id`

```text
session_id:{"sessionUuid":"..."}
```

Supplies or confirms the active session UUID.

### `auto_reconnect_now`

```text
auto_reconnect_now:<playerName>
```

Signals that auto reconnect should proceed for a player.

### `blocked_chat_sql_ids`

```text
blocked_chat_sql_ids:{}
```

Likely maps blocked/hidden chat identifiers.

### `inventory_defs`

```text
inventory_defs:{{BOMB,{{pie,2,1,0},{tomato,10,1,0},...}}}
```

Defines inventory or throwable/charm items. The nested tuple fields appear to include item key, cost/count/duration-like numbers, and availability flags.

### `lbrowse`

```text
lbrowse:{self/player summary},-1,{{player row},{player row},...},0,-1,<lounge name>,...,{settings},{filters}
```

Large lobby bootstrap frame. Observed contents include:

- Current player summary.
- A list of lobby/player rows.
- Lounge name, for example `All+Games`.
- User settings definitions such as `auto_reload_buyin`, `four_color_deck`, `graphics_level`, `sound`, and `show_chips_as_bb_multiple`.
- Filter names such as `abusive_betting_filter`.

Player rows appear to be tuple-like:

```text
{0,<seatOrSessionId>,1,<playerId>,0,<playerName>,<chips>,<jacksOrScore>,<rankOrLevel>,{avatar data},...}
```

Avatar data can contain URL-encoded JSON with color and part indexes.

### `addgames`

```text
addgames:{{game row},{game row},...}
```

Adds lobby game/table rows. A game row appears to include:

- Game/table id.
- Flags such as `has_open_seat` and `players_sitting`.
- Room name.
- Encoded player-name HTML fragments.
- Player count label.
- Seat count.
- Game type / blind speed / buy-in fields.
- Encoded description HTML.
- Min/max buy-in-like numeric fields.

Example row shape:

```text
{<gameId>,{{has_open_seat,1},{players_sitting,3}},<encoded room name>,-1,0,{<encoded players>},<player count label>,...}
```

### `gamesdone`

```text
gamesdone:
```

Marks the end of a game list batch.

### `lounge_id`

```text
lounge_id:<id>
```

Sets the current lounge id.

### `lounge`

```text
lounge:<messageOrCode>
```

Lobby/lounge notification frame. Observed forms:

```text
lounge:0
lounge:<encoded announcement text>
```

Example decoded announcement:

```text
The Bad Beat Jackpot is now 50,000,000 Chips!
```

Feature use:

- Lobby announcement feed.
- Jackpot/tournament notification filtering.

### `next_tourney_win`

```text
next_tourney_win:<enabled>,<unknown>,<encoded name>,<currency>,<unknown>,<id>,<timestamp>,<unknown>,{...}
```

Tournament or bonus-game announcement. The observed timestamp looked like a Unix timestamp.

### `set_bad_beat_jackpot_amount`

```text
set_bad_beat_jackpot_amount:{"powerPlayerWinnableAmount":50000000,"nonPowerPlayerWinnableAmount":12500000,"lastWinner":"name:id"}
```

Jackpot state as JSON.

### `high_hand_jackpot`

```text
high_hand_jackpot:{"numChipsForPowerPlayer":50000,"numChipsForNonPowerPlayer":25000}
```

High-hand jackpot state as JSON.

Can also include the current high hand:

```text
high_hand_jackpot:{
  "currentHighHand": {
    "leader": "<playerName>:<playerId>",
    "label": "Full House",
    "cardShorthands": ["6d", "6s", "6h", "Jc", "Js"],
    "numRankedCards": 5
  },
  "numChipsForPowerPlayer": 50000,
  "numChipsForNonPowerPlayer": 25000
}
```

Feature use:

- High-hand jackpot widget.
- Local notification when the leader changes.

### `auto_reconnect_done`

```text
auto_reconnect_done:
```

Marks completion of auto reconnect.

### `add_auto_reconnect_stat`

```text
add_auto_reconnect_stat:<number>
```

Reconnect telemetry/stat frame.

### `update_room_var`

```text
update_room_var:<gameId>,<variableName>,<value>
```

Updates a room/table variable. Observed:

```text
update_room_var:<gameId>,players_sitting,<count>
```

Useful for lobby/table tracking features.

Observed examples show `players_sitting` changing frequently as players sit or leave:

```text
update_room_var:<gameId>,players_sitting,1
update_room_var:<gameId>,players_sitting,2
update_room_var:<gameId>,players_sitting,3
```

### `lleave`

```text
lleave:<seatOrSessionId>,
```

Lobby player leave event.

### `player_info`

```text
player_info:<json payload>
```

Detailed profile response after `get_player_info:<playerId>`.

Observed JSON fields:

- `playerIdName`: string shaped like `<playerName>:<playerId>`.
- `powerPlayerStatus`: object with `isPowerPlayer` and `isSubscription`.
- `numChipsInBank`: number.
- `avatarJson`: JSON string containing avatar parts/colors.
- `medalsDtoString`: tuple-style medal list.
- `isDiscordLinked`: boolean.
- `blockingTypes`: array.
- `playerStyleString`: tuple-style style/profile label data.
- `statsFields`: array of `[label, value]` pairs.

Observed stat labels include:

- `Hands Played`
- `Buy-ins`
- `Triplejacks`
- `Player Since`
- `Last Hand Played`
- `High Hand Jackpots`
- `High Hand Jackpots in Past Week`

Feature use:

- Player notes/details panel.
- Cache player profile summaries by player id.
- Show power-player status, account age, and high-hand stats.

### `friends_close`

```text
friends_close:
```

Closes the friends panel or signals that the friends/social UI has been closed. Observed immediately before a `player_info` response.

### `friend_show_request`

```text
friend_show_request:<requestListName>,<playerName>:<playerId>
```

Shows or confirms a friend request in a request list. Observed:

```text
friend_show_request:requests_sent,<playerName>:<playerId>
```

### `friends_online`

```text
friends_online:<unknown>,{{<sectionName>,{{<playerName>:<playerId>,<lastSeenOrStatus>,<metadata>},...}},...}
```

Friends/social list payload. Observed sections:

- `friends`
- `requests_sent`

Observed shape:

```text
friends_online:0,{
  {friends,{{<friendName>:<friendId>,1h,{}}}},
  {requests_sent,{{<playerName>:<playerId>,,{}}}}
}
```

Inferred fields:

- First field may be count, page, or status.
- Section names group friend records and pending requests.
- Friend rows use `<playerName>:<playerId>`, a status/last-seen field like `1h`, and metadata/options.
- Pending request rows can have an empty status field.

Feature use:

- Friends panel helper/summary.
- Cache friend request state.
- Player info shortcuts from friend rows.

### `bomb`

```text
bomb:<itemKey>,<sourcePlayerName>,<countOrFlag>
```

Item/throwable event trigger. Despite the command name, the first field appears to be the item key, so similar events may exist for different item types.

Observed:

```text
bomb:bomb,<playerName>,1
bomb:pie,<playerName>,1
```

Feature use:

- Optional activity log for thrown items.
- Cooldown/inventory observation if paired with `jacks` or inventory frames.

### `newbomb`

```text
newbomb:<itemKey>,<sourceOrActorSeat>,<targetSeat>,<x1>,<y1>,<x2>,<y2>,<physics...>,<flags...>,<effectId>
```

Animation/effect payload for a thrown item. Observed fields include decimal coordinates and physics-like values:

```text
newbomb:bomb,1,-1,-450.0,55.0,300.0,110.0,<angleOrVelocity>,<scaleOrVelocity>,<rotationOrDuration>,3,0.5,<flags...>,<effectId>
newbomb:pie,1,-1,225.0,220.0,300.0,110.0,<angleOrVelocity>,<scaleOrVelocity>,<rotationOrDuration>,3,0.5,<flags...>,<effectId>
```

Because the payload starts with an item key, this appears to be the generic thrown-item animation frame even when the command name says `newbomb`.

The server accepts the older outgoing `bomb:<itemKey>,<targetPlayerName>,<countOrFlag>` command for throw requests. `newbomb:` is the incoming animation/effect result and should not be used as an outbound spam command.

Feature use:

- Item/effect activity log.
- Ignore/filter visual effects locally, if a future UI toggle needs it.

### `jacks`

```text
jacks:<oldOrCurrentJacks>,<newOrCurrentJacks>
```

Updates the local user's Jacks balance after item usage or related actions.

Observed near bomb usage:

```text
jacks:2957,5085
jacks:2957,5070
```

The first field may be a stable balance/category and the second the current Jacks total, but more captures are needed.

Side bets also change this balance. A side-bet attempt can reduce Jacks, then a refund can restore them:

```text
jacks:2937,5068
...
side_bet_refunded:...
jacks:2957,5068
```

### `bubble`

```text
bubble:<playerId>,<encoded html/text>,<foregroundHex>,<backgroundHex>,<unknown>,<options>
```

Displays a bubble/notification over or near a player.

Observed:

```text
bubble:<playerId>,<encoded smiley/html and rank text>,FFFFFF,008800,0,{}
```

Feature use:

- Activity/event log.
- Optional local filter for non-chat visual popups.

### `side_bet`

```text
side_bet:<targetPlayerId>
```

Observed when the local player places a side bet on a target player during the side-bet phase.

### `side_bet_added`

```text
side_bet_added:<sideBetIdOrCount>,<amount>,<amount>,<bettorName>:<bettorId>,<targetName>:<targetId>
```

Confirms that a side bet was added.

Observed:

```text
side_bet_added:1,20,20,<bettorName>:<bettorId>,<targetName>:<targetId>
```

The repeated `20,20` values may be wager amount and displayed/accepted amount.

### `side_bet_done`

```text
side_bet_done:<sideBetIdOrCount>,
```

Marks the local side-bet action as finished for the phase.

### `side_bet_refunded`

```text
side_bet_refunded:<encoded message>
```

Refund notification. Observed decoded message:

```text
Side bet refunded! No one else bet.
```

This can arrive after the hand `win` settlement, so side-bet handling should not assume all side-bet state ends when `side_bet_phase` ends.

### `side_bet_hand_incomplete`

```text
side_bet_hand_incomplete:
```

Observed after a refunded side bet. Likely means the side-bet wager did not qualify because the hand/side-bet conditions were incomplete.

## Chat And Direct Message Frames Already Used By The Script

### `pc`

```text
pc:<playerId>,<playerName>,<html>
```

Public chat message. The script extracts chat text from a `font` element with `color="#444444"`.

Observed public-chat echo/broadcast after sending `lc:hi`:

```text
pc:<playerId>,<playerName>,<font color="#CC6600"><font face='smileys' size='10'>z</font > <playerName>&gt;</font> <font color="#444444">hi</font>
```

HTML fields observed in public chat:

- Player/name label uses a colored `font`, for example `color="#CC6600"`.
- A smiley/avatar glyph can be nested as `<font face='smileys' size='10'>z</font >`.
- Message text uses `<font color="#444444">...</font>`.

### `privatemsg`

```text
privatemsg:<json payload>
```

Direct message event. The script expects fields such as:

- `conversationPlayer`
- `fromPlayer`
- `fromPlayerId`
- `messageId`
- `messageHtml`
- `timestampSecs`

### `private_msgs_recent`

```text
private_msgs_recent:{{<playerName>:<playerId>,<lastMessageTimestampSecs>},...}
```

Recent direct-message conversation list returned after `get_private_msgs_recent:`.

Observed shape:

```text
private_msgs_recent:{{<playerName>:<playerId>,1779725845},{<playerName>:<playerId>,1779718481},...}
```

Notes:

- The timestamp appears to be Unix seconds for the latest conversation activity.
- Player references use the same `<playerName>:<playerId>` shape used elsewhere.
- This frame contains conversation metadata, not message bodies.

Feature use:

- Direct-message conversation list.
- Unread/recent conversation sorting.
- DM notification summaries.

### `privatemsg_log`

```text
privatemsg_log:<json payload>
```

Direct message history batch. The script expects:

- `conversationPlayer`
- `lastUnreadMessageId`
- `messages[]`

Each message can include:

- `id`
- `fromPlayerId`
- `messageHtml`
- `timestampSecs`

Observed sanitized shape:

```json
{
  "conversationPlayer": "<playerName>:<playerId>",
  "lastUnreadMessageId": -1,
  "messages": [
    {
      "id": 23528798,
      "fromPlayerId": 1595227,
      "messageHtml": "<font color=\"#003366\">...</font>",
      "timestampSecs": 1764207740
    },
    {
      "id": 23530861,
      "messageHtml": "<font color=\"#333333\">system transfer/status text</font>",
      "timestampSecs": 1766030179
    }
  ]
}
```

Message HTML colors observed:

- `#003366`: normal direct message text.
- `#333333`: system/transfer/status lines, such as chip or Jacks transfers.

Notes:

- Some system messages have no `fromPlayerId`.
- Some message HTML contains nested smiley fonts.
- Message text can include HTML entities such as `&rsquo;`.
- This response can be very large and contain sensitive private content; keep raw captures in ignored local files only.

## In-Game Hand And Action Frames

These frames appear after entering or observing a game/table. The tuple fields below are reconstructed from captures and should be treated as inferred until more hands are compared.

### Room Join / Leave Flow

Joining a room can arrive as a compound frame with slash-delimited subframes:

```text
#(init_game):/<seq>/self_data:<selfPayload>/<seq>/init_game_data:<gamePayload>/<seq>/set_bad_beat_jackpot_amount:<json>
```

Observed subframes:

- `self_data`
- `init_game_data`
- `set_bad_beat_jackpot_amount`

After the compound `init_game` frame, room setup frames can follow:

```text
bombs_init:<item definitions>
poker_room_info:<json room details>
start_seat_timers:{<seatNumber>},<durationMs>,<remainingMs>
lounge_id:-1
next_tourney_win:...
set_bad_beat_jackpot_amount:<json>
high_hand_jackpot:<json>
bet/start_seat_timers action frame
```

Leaving the room and returning to the lobby has been observed as a lobby bootstrap sequence:

```text
lounge:0
su:<unknown>,<playerId>,0
last_chip_stack:<finalTableStack>
lounge:<encoded announcement>
keepalive:<uuid>
login:<auth/client tuple>
init_lobby:,
blocked_chat_sql_ids:{}
inventory_defs:<item definitions>
join_lounge:
lbrowse:<lobby bootstrap>
addgames:<game list>
gamesdone:
lounge_id:-1
next_tourney_win:...
set_bad_beat_jackpot_amount:<json>
high_hand_jackpot:<json>
session_id:<json>
```

Notes:

- No dedicated `leave_game` frame has been identified in this capture. The practical leave signal is the transition from room frames back to lobby/bootstrap frames.
- For extension features, treat a new `init_game` as table-session start and the lobby bootstrap sequence as table-session end.
- `lounge:0` and `init_lobby:,` can arrive before the lobby has fully rendered. For user-facing "left table" summaries, wait until `gamesdone:` so the lobby return is complete.
- `last_chip_stack:<finalTableStack>` is emitted during the leave sequence and should be treated as the final authoritative table stack for the local player.
- A session summary popup should be triggered once when `gamesdone:` ends the lobby game list after leaving, before the next `init_game` resets local table state.

Observed quick sit/post/leave regression case:

```text
update_players:{{1595146,20000,95240639,1448,1,}}
#(deal_live_hands):/68/h:{2c,Qc,3c,Ks},{3,5,8},400,800,800,400,.../27/hand_rank:111,K-High,,{},{}
#(bet-your-turn):/155/bet:1,0,800,400,8,-1,{3,5},5,3,1,1,{0},800,1,{{1034872,15425,800},{1595146,19200,800},{1596657,9497,400}},...
bet:1,check,-1,-1
lounge:0
su:1,1595146,0
last_chip_stack:19200
...
gamesdone:
```

Feature implication:

- The local player started at `20000`.
- The compound `bet` stack row `{1595146,19200,800}` uses player id, remaining stack, and committed amount. This captures the posted big blind before any later `update_players` frame.
- The session result should be `19200 - 20000 = -800`, or `-1.0 BB` at `400 / 800` blinds.
- If the first positive stack seen is inside a `bet` row, initialize the session start as `remainingStack + committedAmount` so immediate blind posting is not missed.

Observed stand-up/cashout sequence:

```text
sit_with_buyin:<seat>,<unknown>,<buyIn>
sit:<unknown>,<playerId>,<seat>,<tableStack>,<bankChips>,...
update_players:{{<playerId>,<tableStack>,<bankChips>,...}}
su:
su:1,<playerId>,0
update_players:{{<playerId>,<tableStack>,<bankChips>,...}}
last_chip_stack:<tableStack>
update_players:{{<playerId>,0,<bankChipsAfterCashout>,...}}
upd_player_bank:<playerId>,<bankChipsAfterCashout>,...
```

Feature implication:

- `last_chip_stack` is the cashout stack and should lock the session end stack.
- The later `update_players` table stack of `0` means the player is no longer seated; it must not overwrite the final session stack.
- If needed, the bank delta can be used as a secondary verification: after standing up, the bank usually increases by the cashed-out table stack.

### `self_data` Subframe

```text
self_data:{<sessionSeatId>,<playerId>,<playerName>,<jacks>,<jacksOrBalance>,<bankChips>,...}
```

The local player's room/session identity and balances inside the `#(init_game)` compound frame.

Feature use:

- Identify the local player id and room session id.
- Track starting Jacks/bank balances for session summaries.

### `init_game_data` Subframe

```text
init_game_data:<standardBuyIn>,<unknown>,<minBuyIn>,<maxBuyIn>,<smallBlind>,<bigBlind>,<unknown>,<playerRows>,...,<roomName>,<roomId>,...
```

Large room bootstrap payload inside the `#(init_game)` compound frame.

Observed early fields:

```text
init_game_data:1000,1,500,2000,10,20,0,<playerRows>,...
```

Inferred early fields:

- `1000`: standard buy-in.
- `500`: minimum buy-in.
- `2000`: maximum buy-in.
- `10`: small blind.
- `20`: big blind.

Player rows in `init_game_data` include player id/name, current table stack, bank chips, points, seat number, avatar/style data, and medals. The local player row can have stack `0` when observing or not seated.

Feature use:

- Initialize session summary values:
  - room id/name
  - standard/min/max buy-in
  - small blind / big blind
  - local player seat and starting stack, when seated
- Initialize table player cache.

### `bombs_init`

```text
bombs_init:{{<itemKey>,<label>,<unknown>,<unknown>,<requiredLevel>,<cost>,<premiumOrLockedFlag>,<unlockText>},...}
```

Room/item definition payload. Despite the name, this includes all throwable/gift-style items.

Observed item keys include:

- `rb`
- `pie`
- `tomato`
- `balloon`
- `bomb`
- `anvil`
- `snowball`
- `beer`
- `trash`
- `pot`
- `egg`
- `slime`
- `missile`
- `plane`
- `fish`
- `sheep`
- `snowcone`
- `shark`
- `grenade`
- `wine`
- `drink`
- `flowers`
- `burger`
- `slimeball`
- `presentcharm`
- `trophycharm`
- `cake`
- `bdaycake`
- `eye`
- `fist`
- `rulebook`
- `crown`
- `gelatinpie`
- `marshmallow`
- `fireball`
- `storm`
- `spade`
- `heart`
- `tophat`
- `fedora`
- `rocket`
- `piggy`

Feature use:

- Item catalog for activity logs.
- Decode `bomb:` / `newbomb:` item keys into readable labels.

### `poker_room_info`

```text
poker_room_info:<json payload>
```

Room details as JSON.

Observed fields:

- `roomName`
- `variantName`
- `variantType`
- `roomOpenSince`
- `roomCreatorIdName`
- `roomCode`
- `infoFields`

Observed `infoFields` labels:

- `Standard Buy-in`
- `Buy-in Range`
- `High Hand Jackpot`
- `Eligible for Bad Beat Jackpot`
- `Game Type`
- `Allow Auto Reload Buy-in`
- `Speed`
- `Side Bets`
- `Side Bet Phase`
- `Rake`
- `Rake Max`
- `Blinds`

Feature use:

- Room details panel.
- Session summary context.
- Confirm blinds and side-bet settings from a JSON source instead of tuple parsing when available.

### `update_players`

```text
update_players:{{<playerId>,<tableChips>,<totalChips>,<statusOrAvatar>,<levelOrFlag>,<scoreOrPoints>},...}
```

Updates player state during a table session. Observed both single-player and full-table batches:

```text
update_players:{{<playerId>,720,734427,1,1,119101}}
update_players:{{<playerId>,0,463707,1063,1,330041},{<playerId>,1651,92300,12,1,6448},...}
```

Likely fields:

- `playerId`
- Chips at the current table or current stack.
- Total chips/account chips.
- Status/avatar/rank-style numeric field.
- Level, rank, or player-class flag.
- Score/points value. Sometimes empty in interim updates.

Feature use:

- Track chip stack changes by player.
- Track seated players at the current table.
- Detect joins/leaves or new hand resets.
- Feed player notes/tags with current stack and table position.

For live room rosters, `update_players` is useful for stack and account state, but it does not carry seat numbers or player names. Seat membership changes are better tracked from `sit` and `su`, with the initial player id/name/seat map coming from `init_game_data`.

### `upd_player_bank`

```text
upd_player_bank:<playerId>,<bankChips>,<unknown>
```

Updates a player's bank/account chip balance. Observed after the local player sat with chips:

```text
upd_player_bank:1595146,95240639,0
```

Feature use:

- Account/bank balance display.
- Distinguish table stack changes from bank balance changes when calculating a table-session result.

### `update_chip_stacks`

```text
update_chip_stacks:{{<seatNumber>,<chipStack>},...}
```

Small focused stack update by seat number.

```text
update_chip_stacks:{{8,1810}}
update_chip_stacks:{{1,1591}}
```

Feature use:

- Lightweight table-stack overlay.
- Session delta tracking without needing every full `update_players` frame.

### `last_chip_stack`

```text
last_chip_stack:<finalTableStack>
```

Observed during the leave-to-lobby sequence after `su:<...>` and before lobby bootstrap frames:

```text
su:1,1595146,0
last_chip_stack:19200
```

Feature use:

- Final authoritative local table stack when leaving a room.
- Session summary end-stack source, especially when leaving before a normal `win` or `update_chip_stacks` settlement.
- Once observed, later `update_players` rows with table stack `0` should be interpreted as post-stand-up state, not as losing the table stack.

### `su`

```text
su:<unknown>,<playerId>,<unknownOrSeat>
```

Observed while leaving/standing up from a table:

```text
su:1,1595146,0
```

`su` stands for stand up. In the observed leave flow it arrived after `lounge:0` and immediately before `last_chip_stack:<stack>`.

Feature use:

- Leave/stand-up diagnostics.
- Do not finalize the visible session summary on `su` alone; wait for `last_chip_stack` and the lobby `gamesdone:` marker.
- Remove the player id from live target rosters. If the removed player was selected as a target, clear the selection.

### `sit`

```text
sit:<unknown>,<playerId>,<seat>,<tableStack>,<bankChips>,...
```

Observed when a player sits down or buys in:

```text
sit:<unknown>,1595146,1,20000,95240639,...
```

Inferred fields:

- First field is currently unknown.
- Second field is player id.
- Third field is seat number.
- Fourth field is the player's current table stack after sitting.
- Fifth field is bank/account chips.

Feature use:

- Add or move a player id in live target rosters.
- Preserve the player name from `init_game_data`, `pc`, `side_bet_added`, or other player-reference frames when known; `sit` itself has not been observed carrying the display name.
- Pair with `su` and lobby-return frames (`lounge:0`, `init_lobby`, `gamesdone`) to keep room-only tools disabled outside rooms.

### `h`

```text
h:<holeCardsOrHiddenCards>,<activeSeatList>,<smallBlind>,<bigBlind>,<unknownBlindOrAnte>,<unknown>,<handId>,<unknown>,<handNumber>,<unknown>,<unknown>,<tableOrGameId>,<unknown>,<unknown>,<unknown>
```

Observed at the start of a new hand:

```text
h:{},{3,8,1},10,20,20,10,<handId>,20,21,0,,<tableId>,1,0,1
h:{},{8,1,3},10,20,20,10,<handId>,20,22,0,,<tableId>,1,0,1
```

Likely meanings:

- First field: hole cards or hidden card data. `{}` when unavailable to observer or not dealt yet.
- Second field: active seat order for the hand.
- Third/fourth fields: small blind and big blind.
- A later field looks like a hand id.
- Another later field increments like a hand number.
- One field appears to be table/game id.

Feature use:

- Start/reset a local hand tracker.
- Record blind level.
- Track active seats and hand number.

### `show`

```text
show:<stageOrReason>,{{<seat>,<unknown>,<chipOrResult>,{<card1>,<card2>}},...},{<lastAction>}
```

Reveals player hole cards around showdown/all-in/hand resolution.

Observed:

```text
show:2,{{3,0,0,{Jc,6d}},{8,0,1170,{Kh,Ks}}},{6,Fold,0}
```

Inferred fields:

- First field may be reveal stage/reason.
- Each reveal tuple includes seat number and a two-card set.
- A numeric field in the reveal tuple may be remaining stack or result amount.
- Final tuple looks like the last action `{<seat>,<actionName>,<amount>}`.

Feature use:

- Showdown card capture.
- Hand history export.

### Voluntary Post-Hand Reveal / Muck Toggle

The local player can choose to reveal their hand after a completed hand even when the hand was not automatically shown down. This is distinct from `show:`, which appears to reveal hole cards around showdown/all-in/hand resolution. The observed voluntary reveal flow is:

```text
win:<winner/results payload>
toggle_reveal:<seat>,<unknownId>
jacks:<oldOrCurrentJacks>,<newOrCurrentJacks>
bubble:<playerId>,<encoded hand rank text>,000000,FFFF99,0,{<card1>,<card2>,...}
reveal_this_hand:<seat>
update_players:<player state rows>
```

Observed example:

```text
win:{{{60000},0,{{1,0,{}}},60000,Generel+wins+%2460%2C000+%3Cfont+color%3D%22%23666666%22%3E%28%2B%2430%2C000%29%3C%2Ffont%3E,{{1596657,6,0,{,,,},1908131,0,4353},{1266379,10,0,{,,,},1574750,14555900,1855421},{285325,7,0,{,,,},1000000,183623054,188186},{1595146,1,1,{,,,},739712,93263005,473961}},{{4,3d}},0,{0,{}},0}},{{1596657,4353},{1266379,1855421},{285325,188186},{1595146,473961}},0,0
toggle_reveal:1,145348
jacks:12407,2113
bubble:1595146,Two+Pair%2C+QQ%2FJJ,000000,FFFF99,0,{Js,5d,5c,Qd}
reveal_this_hand:1
update_players:{{1595146,739712,93263005,1448,1,473968}}
```

Inferred fields:

- `toggle_reveal:<seat>,<unknownId>` appears to start the local voluntary reveal/muck action for the player's seat.
- `reveal_this_hand:<seat>` confirms that the local player chose to reveal this completed hand.
- The paired `bubble` carries the public hand-rank text and revealed cards. In the example, `Two+Pair%2C+QQ%2FJJ` decodes to `Two Pair, QQ/JJ`, and the option tuple contains `{Js,5d,5c,Qd}`.
- The nearby `jacks` update suggests revealing may charge or adjust a Jacks-related balance, but the exact balance semantics are still uncertain.
- A following `update_players` row can update the local player's visible count/balance after reveal.

Feature use:

- Detect when the local player voluntarily reveals instead of mucking after the hand ends.
- Capture revealed cards and rank text for hand-history tooling.
- Avoid treating `bubble` rank text as normal chat.

### `flop`

```text
flop:<newBoardCards>,<streetOrCardIndex>,<unknown>,<potSet>
```

Despite the command name, this can appear after showdown-like frames with only one card tuple:

```text
flop:{{4,6h}},4,15,{1360}
```

Inferred fields:

- First field: board card tuples using `{<boardIndex>,<card>}`.
- Second field may be board index, street, or card count marker.
- Last field is likely pot set/current pot.

Feature use:

- Board card tracker when cards arrive outside the compound `bet` payload.
- Hand history reconstruction.

### `medals_style`

```text
medals_style:{{<playerId>,<medalList>,<styleOrProfileTuple>},...}
```

Large per-player profile/medal/style batch, often emitted around hand start.

Medal entries look like:

```text
{<medalKey>,<encoded label>,<categoryOrIconIndex>,<value>,<displayFlag>}
```

Examples of observed medal keys:

- `star_player`
- `score`
- `royal`
- `sidebets_won`
- `hands_played`
- `level_wins`
- `old_timer`
- `jacks`
- `chips`
- `bombardier`
- `pp`
- `rocket`

The trailing profile/style tuple appears to contain style/personality descriptors such as `Tight`, `Passive`, `Balanced`, or `Lazy`.

Feature use:

- Player info popovers.
- Local player tags seeded from observed play style labels.
- Table HUD metadata, if kept informational and non-invasive.

### Compound Action Frames

Some action frames are compound messages separated by `/`. The observed form:

```text
#(<label>):/<sequence>/bet:<betPayload>/33/start_seat_timers:<timerPayload>,<durationMs>,<durationMs>
```

Example shape:

```text
#(bet-other):/<sequence>/bet:<state fields>/33/start_seat_timers:{<seatNumber>},15000,15000
```

Known subframes:

- `h`
- `hand_rank`
- `bet`
- `start_seat_timers`

The prefix label `#(bet-other)` likely describes event class or animation/audio treatment. The sequence number after the first slash changes per action and may be an event id or protocol sequence id.

Observed labels:

- `#(deal_live_hands)`: hand start/deal compound frame. Can contain `h` and `hand_rank`.
- `#(bet-your-turn)`: action state where the local player can act.
- `#(bet-other)`: action state for another player's action or timer.

Example:

```text
#(deal_live_hands):/68/h:{2c,Qc,3c,Ks},{3,5,8},400,800,800,400,<handId>,20,6,0,,<tableId>,1,1,1/27/hand_rank:111,K-High,,{},{}
#(bet-your-turn):/155/bet:1,0,800,400,8,-1,{3,5},5,3,1,1,{0},800,1,{{1034872,15425,800},{1595146,19200,800},{1596657,9497,400}},...
```

The client action response for checking has been observed as:

```text
bet:1,check,-1,-1
```

### `bet` Subframe

```text
bet:<unknown0>,<unknown1>,<bigBlind>,<smallBlind>,<dealerOrActorSeat>,<unknownSeat>,<seatSet>,<nextSeat>,<dealerSeatOrButton>,<street>,<actionNumber>,<potSet>,<currentBet>,<canActOrIsRaise>,<playerStacksAndBets>,<lastAction>,<timestampMs>,<timerMs>,<unknown>,<unknown>,<unknown>,<boardCards>,<streetCode>,<actionCode>,<unknown>
```

Observed action progression:

```text
bet:...,{0},20,1,{{<playerId>,<stack>,<bet>},...},{-1,,0},<timestamp>,15500,...,{},-1,-1,...
bet:...,{0},20,0,{{<playerId>,<stack>,<bet>},...},{3,Fold,0},<timestamp>,15500,...,{},-1,-1,...
bet:...,{0},20,0,{{<playerId>,<stack>,<bet>},...},{8,Call,20},<timestamp>,15500,...,{},-1,-1,...
bet:...,{40},20,1,{{<playerId>,<stack>,<bet>},...},{1,Check,20},<timestamp>,15500,...,{{0,6s},{1,5d},{2,Kh}},2,4,...
bet:...,{40},40,1,{{<playerId>,<stack>,<bet>},...},{1,Bet,20},<timestamp>,15500,...,{},-1,-1,...
bet:...,{80},40,1,{{<playerId>,<stack>,<bet>},...},{8,Call,20},<timestamp>,15500,...,{{3,Qh}},3,7,...
```

Important inferred fields:

- Stack/bet entries use `{<playerId>,<remainingStack>,<committedBetForStreetOrAction>}` in the captures that include full player identifiers.
- Some earlier captures looked seat-like because player ids were small or seat ids were being shown elsewhere. For session tracking, match the first field against `self_data` player id, not the seat number.
- Last action tuple uses `{<seatNumber>,<actionName>,<amount>}`.
- Observed action names: `Fold`, `Call`, `Check`, `Bet`, `Raise`.
- Pot set uses braces such as `{0}`, `{40}`, `{80}` and may represent current pot(s).
- Board cards appear as indexed cards:

```text
{{0,6s},{1,5d},{2,Kh}}  -> flop
{{3,Qh}}                -> turn
```

- Board card notation appears to be rank plus suit: `6s`, `5d`, `Kh`, `Qh`.
- Street-like numeric field observed increasing:
  - `1`: preflop or first betting round.
  - `2`: flop.
  - `3`: turn.
  - River not yet captured.

Feature use:

- Hand history reconstruction.
- Pot and board display in a helper panel.
- Action timeline such as “Seat 8 called 20”.
- Session stats like hands observed, VPIP-like approximations, or showdown/win counts. Be careful not to create unfair real-time advice; keep this informational.

### `side_bet_phase`

```text
side_bet_phase:<playerStacksAndBets>,<potSet>,<lastAction>,<durationMs>,<unknown>
```

Observed after a late-street/check action, immediately before final stack/pot/win settlement:

```text
side_bet_phase:{{<playerId>,<stack>,<bet>},{<playerId>,<stack>,<bet>},...},{70},{1,Check,0},4000,0
side_bet_phase:{{<playerId>,<stack>,<bet>},{<playerId>,<stack>,<bet>},...},{240},{5,Check,0},4000,0
```

Inferred fields:

- Player stack/bet entries match the `bet` subframe shape.
- Pot set/current pot follows the player stack list.
- Last action uses `{<seat>,<actionName>,<amount>}`.
- `4000` likely indicates the side-bet phase duration in milliseconds.
- The last field has only been observed as `0`.

Observed sequence:

```text
bet:...{240}...{3,Check,0}...
side_bet_phase:<same current stacks>,{240},{5,Check,0},4000,0
update_chip_stacks:{{<seat>,<stack>},...}
pots:{238}
win:<settlement payload>
update_players:<winner update>
update_players:<full table update>
h:<next hand>
```

Notes:

- The `side_bet_phase` last-action tuple can differ from the immediately preceding `bet` frame's last-action tuple in captures. It may represent the seat whose side-bet decision/window is active, not necessarily the poker action that created the phase.
- `pots` can differ slightly from the prior pot set, for example `{240}` before settlement and `{238}` at `pots`. This may account for side-bet/rake/display adjustments or a different pot accounting layer.

Feature use:

- Mark side-bet windows in a hand timeline.
- Avoid mistaking side-bet pauses for normal player action timers.
- Delay final hand result handling until `pots`/`win` arrives rather than treating `side_bet_phase` as settlement.

Side-bet interaction notes:

- The side-bet phase is the short window where the local player is allowed to side bet.
- Side-bet result/refund frames may arrive later, including after `win`.
- During the side-bet phase, side betting appears to be the only available action.
- Side-bet command flow can look like:

```text
side_bet_phase:<stacks>,<pot>,<lastAction>,4000,0
side_bet:<targetPlayerId>
side_bet_added:<id>,20,20,<bettorName>:<bettorId>,<targetName>:<targetId>
side_bet_done:<id>,
jacks:<updated balances>
...
win:<settlement payload>
side_bet_refunded:<encoded message>
side_bet_hand_incomplete:
jacks:<refunded balances>
```

### `start_seat_timers` Subframe

```text
start_seat_timers:{<seatNumber>},<durationMs>,<durationMs>
```

Observed after each `bet` subframe:

```text
start_seat_timers:{3},15000,15000
start_seat_timers:{8},15000,15000
start_seat_timers:{1},15000,15000
```

Starts or resets action timers for one or more seats.

It can also appear as a standalone room setup/update frame:

```text
start_seat_timers:{8},15000,14577
```

The third field appears to be remaining time when the timer is already running.

Feature use:

- Optional local “whose turn” indicator.
- Timing diagnostics for reconnect/lag.

### `win`

```text
win:{{<winBlock>}},{{<playerId>,<scoreOrPoints>},...},<unknown>,<unknown>
```

Observed at hand settlement:

```text
win:{{{80},0,{{<seat>,0,{}}},80,<encoded win text>,<playerRows>,<shownCards>,0,{0,{}},0}},{{<playerId>,<score>},...},0,0
```

Important inferred fields inside the win block:

- Pot set / pot amount, for example `{80}` and `80`.
- Winner seat map, for example `{{8,0,{}}}` or `{{1,0,{}}}`.
- Encoded result text:

```text
<playerName>+wins+%2480+%3Cfont+color%3D%22%23666666%22%3E%28%2B%2440%29%3C%2Ffont%3E
```

Decoded:

```html
<playerName> wins $80 <font color="#666666">(+ $40)</font>
```

- Player rows after the win include player id, seat number, status flags, stack, total chips, and score/points-like values.
- Shown cards can appear as indexed card tuples, for example `{{4,9c}}`.
- Hand/ranking detail can appear near the end, for example `{7,{4,4,4,9,9}}`.
- The trailing list maps player ids to updated score/points values.

Observed encoded text can include hand rank:

```text
<playerName> wins $1,347, Full House, 666/JJ <font color="#666666">(+ $687)</font>
<playerName> wins $238, Two Pair, KK/QQ <font color="#666666">(+ $178)</font>
```

Feature use:

- Hand result timeline.
- Session win/loss tracker by stack delta.
- Showdown card capture.
- Local hand history export.

### `pots`

```text
pots:{<amount>[,<amount>...]}
```

Updates pot totals, likely after hand resolution or side-pot calculation.

Observed:

```text
pots:{1347}
```

Feature use:

- Pot tracker.
- Hand history settlement verification.

## Feature Ideas Enabled By These Frames

- Lobby/table tracker from `addgames`, `gamesdone`, and `update_room_var`.
- Player presence tracker from `lbrowse`, `lleave`, and related lobby events.
- Friends/social tracker from `friends_open`, `friends_online`, `friend_add`, and `friend_show_request`.
- Session/reconnect status from `check_auto_reconnect`, `auto_reconnect_now`, and `auto_reconnect_done`.
- Jackpot display from `set_bad_beat_jackpot_amount` and `high_hand_jackpot`.
- Table action tracker from `h`, compound `bet`, `start_seat_timers`, and `win` frames.
- Chip/session tracker from `update_players`, `update_chip_stacks`, and `win` frames.
- Browser/client diagnostics panel from `set_metadata` and `set_web_client_type`.
- Settings mirror from the `lbrowse` settings definitions.

## Capture Template

When adding new captures, prefer sanitized rows:

```text
time,direction,command,payload_shape,notes
13:33:29.602,out,set_metadata,json,client display and WebGL metadata
13:33:29.602,in,lbrowse,tuple-list,lobby bootstrap
```
