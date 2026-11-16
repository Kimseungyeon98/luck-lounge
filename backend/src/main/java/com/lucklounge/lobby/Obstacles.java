package com.lucklounge.lobby;

import java.util.ArrayList;
import java.util.List;

/**
 * 라운지에서 걸을 수 있는 곳과 장애물. 프론트엔드 frontend/src/three/lounge.ts 의 배치와 같아야 한다.
 * 좌표 단위는 3D 화면과 같은 미터(대략). 카메라는 오른쪽 앞(+x, +z)에서 비스듬히 내려다본다.
 *
 * <p>M10: 방 세 개. 왼쪽 뒤 탕비실 · 가운데 메인 대기실(예전의 1.6배) · 오른쪽 앞 회의실.
 * 방 사이는 낮은 벽이고 문으로만 지나간다.
 */
public final class Obstacles {

    public enum Room { MAIN, PANTRY, MEETING }

    /** 방 바닥 (벽 안쪽 면 기준) {minX, maxX, minZ, maxZ} */
    public static final double[] MAIN = {-11.2, 11.2, -6.0, 7.6};
    public static final double[] PANTRY = {-18.0, -11.6, -6.0, 1.2};
    public static final double[] MEETING = {11.6, 18.8, 0.4, 7.6};
    /** 문 (방 사이 벽에 뚫린 곳) {minZ, maxZ} */
    public static final double[] PANTRY_DOOR = {-3.6, -1.4};
    public static final double[] MEETING_DOOR = {3.0, 5.2};

    /** 전체 걸을 수 있는 범위 (탭 목적지를 여기 안으로 자른다) */
    public static final double MIN_X = PANTRY[0] + 0.3;
    public static final double MAX_X = MEETING[1] - 0.3;
    public static final double MIN_Z = MAIN[2] + 0.3;
    public static final double MAX_Z = MAIN[3] - 0.3;

    /** 걸을 수 있는 네모: 방 안쪽(벽에서 0.3m)과 문 */
    private static final double[][] WALK = {
            {MAIN[0] + 0.3, MAIN[1] - 0.3, MAIN[2] + 0.3, MAIN[3] - 0.3},
            {PANTRY[0] + 0.3, PANTRY[1] - 0.3, PANTRY[2] + 0.3, PANTRY[3] - 0.3},
            {MEETING[0] + 0.3, MEETING[1] - 0.3, MEETING[2] + 0.3, MEETING[3] - 0.3},
            {PANTRY[1] - 0.4, MAIN[0] + 0.4, PANTRY_DOOR[0] + 0.3, PANTRY_DOOR[1] - 0.3},
            {MAIN[1] - 0.4, MEETING[0] + 0.4, MEETING_DOOR[0] + 0.3, MEETING_DOOR[1] - 0.3},
    };

    /** {x, z, 반지름}: 부스 받침 6개(부스 가운데보다 0.2 뒤), 가구 */
    private static final double[][] CIRCLES;

    /** {minX, maxX, minZ, maxZ}: 가구 */
    private static final double[][] BOXES = {
            // 메인: 소파, 책장
            {-2.4, 2.4, -6.0, -4.5},
            {-6.8, -4.6, -6.0, -5.35},
            // 탕비실: 싱크대·커피 머신 조리대, 냉장고, 간식 선반
            {-17.9, -13.4, -6.0, -5.15},
            {-13.3, -12.2, -6.0, -5.0},
            {-18.0, -17.35, -2.6, -0.8},
            // 회의실: 회의 테이블과 의자, 수납장
            {13.0, 17.6, 2.5, 5.5},
            {16.8, 18.6, 0.4, 1.05},
            // 회의실: 이동식 화이트보드 (통계·최고 기록)
            {13.0, 15.4, 0.4, 1.0},
    };

    static {
        List<double[]> c = new ArrayList<>();
        for (Match.Booth b : Match.Booth.values()) {
            c.add(new double[] {b.x, b.z - 0.2, 0.75});
        }
        double[][] furniture = {
                // 메인: 커피 테이블, 1인용 소파 둘, 스탠드, 화분 넷, 빈백 둘
                {0.0, -3.2, 0.8}, {-3.7, -3.5, 0.55}, {3.7, -3.5, 0.55}, {3.3, -5.4, 0.25},
                {-10.6, -5.4, 0.55}, {10.6, -5.4, 0.55}, {-10.6, 7.0, 0.55}, {10.6, 7.0, 0.55},
                {-3.0, 6.5, 0.5}, {2.8, 6.6, 0.5},
                // 탕비실: 정수기, 카페 테이블(의자 포함), 휴지통, 화분
                {-17.55, -4.3, 0.3}, {-15.4, -1.9, 1.0}, {-12.1, 0.7, 0.3}, {-17.4, 0.6, 0.45},
                // 회의실: 화분 둘
                {12.1, 0.9, 0.45}, {18.3, 7.1, 0.45},
        };
        for (double[] f : furniture) {
            c.add(f);
        }
        CIRCLES = c.toArray(new double[0][]);
    }

    private Obstacles() {
    }

    public static boolean blocked(double x, double z) {
        boolean inside = false;
        for (double[] w : WALK) {
            if (x >= w[0] && x <= w[1] && z >= w[2] && z <= w[3]) {
                inside = true;
                break;
            }
        }
        if (!inside) {
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

    /** 이 자리가 어느 방인지. 문 한가운데(벽 중심)를 기준으로 나눈다 */
    public static Room roomOf(double x, double z) {
        if (x < (PANTRY[1] + MAIN[0]) / 2) {
            return Room.PANTRY;
        }
        if (x > (MAIN[1] + MEETING[0]) / 2) {
            return Room.MEETING;
        }
        return Room.MAIN;
    }

    /** 문을 지나는 두 점 (출발 방 쪽, 도착 방 쪽) */
    private static double[][] doorPoints(Room side) {
        if (side == Room.PANTRY) {
            double z = (PANTRY_DOOR[0] + PANTRY_DOOR[1]) / 2;
            return new double[][] {{MAIN[0] + 0.8, z}, {PANTRY[1] - 0.8, z}};
        }
        double z = (MEETING_DOOR[0] + MEETING_DOOR[1]) / 2;
        return new double[][] {{MAIN[1] - 0.8, z}, {MEETING[0] + 0.8, z}};
    }

    /**
     * 탭 이동 경로: 다른 방이면 문을 거쳐 간다 (벽에 막혀 멈추지 않게).
     * @return 차례로 지날 점들. 마지막이 목적지
     */
    public static List<double[]> route(double fromX, double fromZ, double toX, double toZ) {
        Room a = roomOf(fromX, fromZ);
        Room b = roomOf(toX, toZ);
        List<double[]> out = new ArrayList<>();
        if (a != b) {
            if (a != Room.MAIN) {
                double[][] d = doorPoints(a);
                out.add(d[1]);
                out.add(d[0]);
            }
            if (b != Room.MAIN) {
                double[][] d = doorPoints(b);
                out.add(d[0]);
                out.add(d[1]);
            }
        }
        out.add(new double[] {toX, toZ});
        return out;
    }

    /** 메인 대기실 가운데 모이는 자리 (투표가 시작될 때 다른 방에 있던 사람, M10 R5) */
    public static double[] gatherSpot(int i) {
        double a = i * 2.39996; // 황금각: 겹치지 않게 퍼진다
        double r = 1.4 + 0.35 * Math.sqrt(i);
        for (int k = 0; k < 12; k++) {
            double x = Math.sin(a) * r;
            double z = 1.6 + Math.cos(a) * r * 0.8;
            if (!blocked(x, z)) {
                return new double[] {x, z};
            }
            a += 0.5;
            r += 0.2;
        }
        return new double[] {0.0, 1.6};
    }
}
