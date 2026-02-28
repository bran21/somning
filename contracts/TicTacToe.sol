// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TicTacToe
 * @dev A simple multiplayer Tic Tac Toe game with on-chain wagers and logic.
 */
contract TicTacToe {
    enum GameState {
        Waiting,
        Playing,
        Finished
    }
    enum Player {
        None,
        X,
        O
    }

    struct Game {
        address playerX;
        address playerO;
        uint256 wager;
        uint8[9] board; // 0 = None, 1 = X, 2 = O
        Player currentTurn;
        GameState state;
        address winner;
    }

    Game[] public games;

    // Events
    event GameCreated(uint256 indexed gameId, address playerX, uint256 wager);
    event GameJoined(uint256 indexed gameId, address playerO);
    event MoveMade(uint256 indexed gameId, address player, uint8 position);
    event GameFinished(uint256 indexed gameId, address winner, bool isDraw);

    /**
     * @dev Create a new game room waiting for an opponent.
     * The creator automatically plays as 'X' and bets `msg.value`.
     */
    function createRoom() external payable returns (uint256) {
        uint8[9] memory emptyBoard;

        Game memory newGame = Game({
            playerX: msg.sender,
            playerO: address(0),
            wager: msg.value,
            board: emptyBoard,
            currentTurn: Player.X,
            state: GameState.Waiting,
            winner: address(0)
        });

        games.push(newGame);
        uint256 gameId = games.length - 1;

        emit GameCreated(gameId, msg.sender, msg.value);
        return gameId;
    }

    /**
     * @dev Join an existing game room.
     * The joiner plays as 'O' and must match the bet exact value.
     */
    function joinRoom(uint256 gameId) external payable {
        require(gameId < games.length, "Invalid game ID");
        Game storage game = games[gameId];

        require(
            game.state == GameState.Waiting,
            "Game is not waiting for players"
        );
        require(msg.value == game.wager, "Must match the wager exact amount");
        require(msg.sender != game.playerX, "Cannot play against yourself");

        game.playerO = msg.sender;
        game.state = GameState.Playing;

        emit GameJoined(gameId, msg.sender);
    }

    /**
     * @dev Make a move on the board.
     * @param gameId The ID of the game.
     * @param position The board position (0-8).
     */
    function makeMove(uint256 gameId, uint8 position) external {
        require(gameId < games.length, "Invalid game ID");
        Game storage game = games[gameId];

        require(game.state == GameState.Playing, "Game is not active");
        require(position < 9, "Invalid board position");
        require(
            game.board[position] == uint8(Player.None),
            "Position already taken"
        );

        Player p;
        if (msg.sender == game.playerX) {
            require(game.currentTurn == Player.X, "Not your turn");
            p = Player.X;
        } else if (msg.sender == game.playerO) {
            require(game.currentTurn == Player.O, "Not your turn");
            p = Player.O;
        } else {
            revert("You are not a player in this game");
        }

        // Apply move
        game.board[position] = uint8(p);

        emit MoveMade(gameId, msg.sender, position);

        // Check for win
        if (_checkWin(game.board, p)) {
            game.state = GameState.Finished;
            game.winner = msg.sender;
            emit GameFinished(gameId, msg.sender, false);

            // Payout winner
            uint256 totalPrize = game.wager * 2;
            if (totalPrize > 0) {
                (bool success, ) = game.winner.call{value: totalPrize}("");
                require(success, "Transfer failed");
            }
        }
        // Check for draw
        else if (_isBoardFull(game.board)) {
            game.state = GameState.Finished;
            emit GameFinished(gameId, address(0), true);

            // Refund players
            if (game.wager > 0) {
                (bool s1, ) = game.playerX.call{value: game.wager}("");
                (bool s2, ) = game.playerO.call{value: game.wager}("");
                require(s1 && s2, "Refund failed");
            }
        }
        // Continue game
        else {
            game.currentTurn = (p == Player.X) ? Player.O : Player.X;
        }
    }

    /**
     * @dev Get total number of games.
     */
    function getGamesCount() external view returns (uint256) {
        return games.length;
    }

    /**
     * @dev Get the full board state of a game.
     */
    function getBoard(uint256 gameId) external view returns (uint8[9] memory) {
        require(gameId < games.length, "Invalid game ID");
        return games[gameId].board;
    }

    // --- Internal Helpers ---

    function _checkWin(
        uint8[9] memory board,
        Player p
    ) internal pure returns (bool) {
        uint8 val = uint8(p);

        // Rows
        if (board[0] == val && board[1] == val && board[2] == val) return true;
        if (board[3] == val && board[4] == val && board[5] == val) return true;
        if (board[6] == val && board[7] == val && board[8] == val) return true;

        // Columns
        if (board[0] == val && board[3] == val && board[6] == val) return true;
        if (board[1] == val && board[4] == val && board[7] == val) return true;
        if (board[2] == val && board[5] == val && board[8] == val) return true;

        // Diagonals
        if (board[0] == val && board[4] == val && board[8] == val) return true;
        if (board[2] == val && board[4] == val && board[6] == val) return true;

        return false;
    }

    function _isBoardFull(uint8[9] memory board) internal pure returns (bool) {
        for (uint8 i = 0; i < 9; i++) {
            if (board[i] == uint8(Player.None)) {
                return false;
            }
        }
        return true;
    }
}
