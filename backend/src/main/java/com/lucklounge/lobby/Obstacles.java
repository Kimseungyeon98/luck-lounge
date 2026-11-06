package com.lucklounge.lobby;

/**
 * 라운지에서 걸을 수 있는 범위와 장애물. 프론트엔드 frontend/src/three/lounge.ts 의 배치와 같아야 한다.
 * 좌표 단위는 3D 화면과 같은 미터(대략).
 */
public final class Obstacles {

    public static final double MIN_X = -5.4;
    public static final double MAX_X = 5.4;
    public static final double MIN_Z = -3.6;
    public static final double MAX_Z = 5.2;

    /** {x, z, 반지름}: 테이블, 화분 4개, 부스 받침 2개 */
    private static final double[][] CIRCLES = {
            {-0.4, -2.4, 0.95},
            {-5.2, -4.4, 0.6}, {5.1, -4.4, 0.6}, {-5.2, 4.7, 0.6}, {5.1, 4.7, 0.6},
            {-3.0, 2.4, 0.75}, {3.0, 2.4, 0.75},
    };

    /** {minX, maxX, minZ, maxZ}: 소파 */
    private static final double[][] BOXES = {
            {-2.6, 1.8, -5.0, -3.75},
    };

    private Obstacles() {
    }

    public static boolean blocked(double x, double z) {
        if (x < MIN_X || x > MAX_X || z < MIN_Z || z > MAX_Z) {
            return true;
        }
        for (double[] c : CIRCLES) {
            if (Math.hypot(x - c[0], z - c[1]) < c[2]) {
                return true;
            }
        }
        for (double[] b : BOXES) {
            if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) {
                return true;
            }
        }
        return false;
    }
}
