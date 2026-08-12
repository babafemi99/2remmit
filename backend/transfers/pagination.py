from rest_framework.pagination import CursorPagination


class TransferCursorPagination(CursorPagination):
    page_size = 5
    ordering = ("-created_at", "-id")


class TransferActivityCursorPagination(CursorPagination):
    page_size = 5
    ordering = "-id"
