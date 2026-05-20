package auth

import (
	"fmt"

	"github.com/VaalaCat/frp-panel/common"
	"github.com/VaalaCat/frp-panel/defs"
	"github.com/VaalaCat/frp-panel/models"
	"github.com/VaalaCat/frp-panel/pb"
	"github.com/VaalaCat/frp-panel/services/app"
	"github.com/VaalaCat/frp-panel/services/dao"
	"github.com/VaalaCat/frp-panel/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type registerJSONRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	Email      string `json:"email"`
	InviteCode string `json:"invite_code"`
}

func RegisterGinHandler(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		req := registerJSONRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			common.ErrResp(c, &pb.RegisterResponse{
				Status: &pb.Status{Code: pb.RespCode_RESP_CODE_INVALID, Message: err.Error()},
			}, err.Error())
			return
		}

		resp, err := registerUser(app.NewContext(c, appInstance), req)
		if err != nil {
			common.ErrResp(c, resp, err.Error())
			return
		}
		common.OKResp(c, resp)
	}
}

func RegisterHandler(c *app.Context, req *pb.RegisterRequest) (*pb.RegisterResponse, error) {
	return registerUser(c, registerJSONRequest{
		Username: req.GetUsername(),
		Password: req.GetPassword(),
		Email:    req.GetEmail(),
	})
}

func registerUser(c *app.Context, req registerJSONRequest) (*pb.RegisterResponse, error) {
	if req.Username == "" || req.Password == "" || req.Email == "" {
		return &pb.RegisterResponse{
			Status: &pb.Status{Code: pb.RespCode_RESP_CODE_INVALID, Message: "invalid username or password or email"},
		}, fmt.Errorf("invalid username or password or email")
	}

	userCount, err := dao.NewQuery(c).AdminCountUsers()
	if err != nil {
		return &pb.RegisterResponse{
			Status: &pb.Status{Code: pb.RespCode_RESP_CODE_INVALID, Message: err.Error()},
		}, err
	}

	if !registerEnabled(c) && userCount > 0 {
		return &pb.RegisterResponse{
			Status: &pb.Status{Code: pb.RespCode_RESP_CODE_INVALID, Message: "register is disabled"},
		}, fmt.Errorf("register is disabled")
	}

	tenantID := defs.DefaultAdminUserID
	if userCount > 0 && inviteRequired(c) {
		tenantID, err = consumeInviteCode(c, req.InviteCode)
		if err != nil {
			return &pb.RegisterResponse{
				Status: &pb.Status{Code: pb.RespCode_RESP_CODE_INVALID, Message: err.Error()},
			}, err
		}
	}

	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return &pb.RegisterResponse{
			Status: &pb.Status{Code: pb.RespCode_RESP_CODE_INVALID, Message: err.Error()},
		}, err
	}

	newUser := &models.UserEntity{
		UserName: req.Username,
		Password: hashedPassword,
		Email:    req.Email,
		Status:   models.STATUS_NORMAL,
		Role:     defs.UserRole_Normal,
		TenantID: tenantID,
		Token:    uuid.New().String(),
	}

	if userCount == 0 {
		newUser.Role = defs.UserRole_Admin
		newUser.TenantID = defs.DefaultAdminUserID
	}

	err = dao.NewMutation(c).CreateUser(newUser)
	if err != nil {
		return &pb.RegisterResponse{
			Status: &pb.Status{Code: pb.RespCode_RESP_CODE_INVALID, Message: err.Error()},
		}, err
	}

	return &pb.RegisterResponse{
		Status: &pb.Status{Code: pb.RespCode_RESP_CODE_SUCCESS, Message: "ok"},
	}, nil
}
