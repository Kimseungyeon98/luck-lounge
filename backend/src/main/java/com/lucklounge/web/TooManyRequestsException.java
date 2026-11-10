package com.lucklounge.web;

/** 너무 자주 요청함 (429). 메시지는 화면에 그대로 보여 준다. */
public class TooManyRequestsException extends RuntimeException {

    public TooManyRequestsException(String message) {
        super(message);
    }
}
